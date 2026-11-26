import { randomUUID } from 'node:crypto';
import type { ApiErrorReason } from '@contract/api';
import type { LinkedTarget, StarTarget } from '@contract/launch';
import type {
  AnswerRequest,
  AnswerResponse,
  PeekLine,
  SessionEvent,
  SessionNote,
  SessionQuestion,
  SessionStatus,
  SessionView,
} from '@contract/session';
import type { AgentEntry } from './agents.ts';
import { answerText, askDecision, readAskQuestions, rewakeText } from './answer.ts';
import { AGENTS_POLL_MS, HOLD_MARGIN_S, HOLD_TIMEOUT_S, PEEK_LINES } from './constants.ts';
import type { HookEvent, StopEvent } from './hook-event.ts';
import { identify, type Launch } from './identity.ts';
import type { LaunchStore } from './launch-store.ts';
import { afterHook, afterPoll, fromAgent, isWakePrompt, type StateCell } from './lifecycle.ts';
import { boardAnswerLine, peekLine } from './peek.ts';
import { parseRound } from './round.ts';
import { isStarTarget, sameTarget, type LinkTarget } from './target.ts';

export interface HubDeps {
  now(): Date;
  /** `claude agents --json`, parsed. `null` when it could not be read. */
  readAgents(): Promise<AgentEntry[] | null>;
  /** Links a Session found only in `agents --json` after a board restart. `null` leaves it unlinked. */
  identifyByCwd(cwd: string): Promise<LinkTarget | null>;
  /** `terminal` is an iTerm session id or a tmux name. Resolves to `null` once typed. */
  typeInto(terminal: string, text: string): Promise<TypeFailure | null>;
  launchStore: LaunchStore;
}

export type TypeFailure = Extract<ApiErrorReason, { code: 'tab-closed' | 'type-failed' }>;

/** `typed` ends a hold with no wake: the answer already reached the Session as a Human prompt. */
type HoldEnd =
  | { code: 'answered'; answer: AnswerRequest }
  | { code: 'typed' }
  | { code: 'dropped' }
  | { code: 'timed-out' };

interface Hold {
  questionId: string;
  /** Set while a typed answer is in flight, so no other answer wins meanwhile. */
  typing: boolean;
  end(outcome: HoldEnd): void;
}

interface Linked {
  sessionId: string;
  repo: string;
  target: LinkedTarget;
  startedAt: Date;
  cell: StateCell;
  question: SessionQuestion | null;
  note: SessionNote | null;
  peek: PeekLine[];
  hold: Hold | null;
}

const FINAL = new Set(['ended', 'lost']);
const MAX_LAUNCHES = 100;
const MAX_REPLACED = 500;

/** Every linked Session, in memory only. Hook routes feed it, the SSE route and answer route read it. */
export class SessionHub {
  private readonly sessions = new Map<string, Linked>();
  /** Sessions a newer one on the same target replaced. Their events are dropped. */
  private readonly replaced = new Set<string>();
  /** Saved through `launchStore`, so a board restart keeps each Session's tab. */
  private readonly launches: Launch[] = [];
  /** Saves run one at a time and after the load, so the file never drops saved records or ends on an older list. */
  private saving: Promise<void> = Promise.resolve();
  private loading: Promise<void> | null = null;
  private readonly listeners = new Set<(event: SessionEvent) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private readonly deps: HubDeps;

  constructor(deps: HubDeps) {
    this.deps = deps;
  }

  /** Reads `agents --json` once, linking the Sessions a restart forgot. */
  async start(): Promise<void> {
    await this.loaded();
    await this.poll({ rebuild: true });
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  launched(launch: Launch): void {
    this.launches.push(launch);
    this.keepNewestLaunches();
    this.saving = this.saving
      .then(() => this.loaded())
      .then(() => this.deps.launchStore.save([...this.launches]))
      .catch((error: unknown) => console.error(error));
    for (const session of this.sessions.values()) {
      if (sameLink(launch, session)) this.emit({ type: 'status', session: this.status(session) });
    }
  }

  private loaded(): Promise<void> {
    return (this.loading ??= this.loadLaunches());
  }

  /** Saved records go before any Start made while loading, so the newest Start still wins its star. */
  private async loadLaunches(): Promise<void> {
    try {
      this.launches.unshift(...(await this.deps.launchStore.load()));
      this.keepNewestLaunches();
    } catch (error) {
      console.error(error);
    }
  }

  private keepNewestLaunches(): void {
    this.launches.splice(0, this.launches.length - MAX_LAUNCHES);
  }

  /** Stars only: a new session holds no star a Start or a prune must respect. */
  liveTargets(): { repo: string; target: StarTarget }[] {
    return [...this.sessions.values()].flatMap((s) =>
      !FINAL.has(s.cell.state) && isStarTarget(s.target)
        ? [{ repo: s.repo, target: s.target }]
        : [],
    );
  }

  snapshot(): SessionView[] {
    return [...this.sessions.values()].map((s) => ({ ...this.status(s), peek: [...s.peek] }));
  }

  subscribe(listener: (event: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** One HTTP hook. Resolves to the hook's output, which holds only for `AskUserQuestion`. */
  async hook(header: string | undefined, event: HookEvent, signal: AbortSignal): Promise<unknown> {
    const session = this.linkFor(header, event);
    if (!session) return {};
    this.record(session, event);
    if (event.hook_event_name !== 'PermissionRequest' || event.tool_name !== 'AskUserQuestion') {
      return {};
    }
    const questions = readAskQuestions(event.tool_input);
    if (!questions) return {};
    const end = await this.hold(session, { kind: 'ask', id: randomUUID(), questions }, signal);
    if (end.code !== 'answered' || end.answer.kind !== 'ask') return {};
    return askDecision(event.tool_input, end.answer.answers);
  }

  /**
   * The `Stop` the rewake hook long-polls with. Resolves to the framed text to wake on, or `null`.
   * `hookStarted` (epoch ms) caps the hold at the hook's own deadline when it re-posts after a restart.
   */
  async rewake(
    header: string | undefined,
    event: StopEvent,
    signal: AbortSignal,
    hookStarted: number | null = null,
  ): Promise<string | null> {
    const session = this.linkFor(header, event);
    if (!session) return null;
    this.record(session, event);
    const message = event.last_assistant_message ?? '';
    const questions = parseRound(message);
    const id = randomUUID();
    const question: SessionQuestion =
      questions.length > 0
        ? { kind: 'round', id, message, questions }
        : { kind: 'reply', id, message };
    const end = await this.hold(session, question, signal, hookStarted);
    return end.code === 'answered' ? rewakeText(end.answer) : null;
  }

  /** First answer wins. Anything later, or for a question no longer held, is `gone`. */
  async answer(request: AnswerRequest): Promise<AnswerResponse | TypeFailure> {
    const found = this.heldFor(request);
    if (!found) return { code: 'gone' };
    const terminal = this.terminalOf(found.session);
    const text = answerText(request);
    if (request.kind !== 'ask' && request.delivery === 'typed' && terminal && text) {
      return this.typeAnswer(found, terminal, request, text);
    }
    found.hold.end({ code: 'answered', answer: request });
    if (text) this.addPeek(found.session, boardAnswerLine(text, this.deps.now()));
    return { code: 'sent' };
  }

  private async typeAnswer(
    { session, hold }: { session: Linked; hold: Hold },
    terminal: string,
    request: AnswerRequest,
    text: string,
  ): Promise<AnswerResponse | TypeFailure> {
    hold.typing = true;
    const failure = await this.deps.typeInto(terminal, text);
    hold.typing = false;
    if (failure) return failure;
    hold.end({ code: 'typed' });
    return { code: 'sent' };
  }

  private heldFor(request: AnswerRequest): { session: Linked; hold: Hold } | null {
    const session = this.sessions.get(request.sessionId);
    const hold = session?.hold;
    if (!session || !hold || hold.typing || hold.questionId !== request.questionId) return null;
    return session.question?.kind === request.kind ? { session, hold } : null;
  }

  async poll({ rebuild = false }: { rebuild?: boolean } = {}): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const entries = await this.deps.readAgents();
      if (entries) await this.applyAgents(entries, rebuild);
    } catch (error) {
      console.error(error);
    } finally {
      this.polling = false;
      this.schedule();
    }
  }

  private async applyAgents(entries: AgentEntry[], rebuild: boolean): Promise<void> {
    const now = this.deps.now();
    for (const session of this.sessions.values()) {
      if (FINAL.has(session.cell.state)) continue;
      const entry = entries.find((e) => e.sessionId === session.sessionId) ?? null;
      this.move(session, afterPoll(session.cell, entry, now));
    }
    if (!rebuild) return;
    for (const entry of entries) {
      if (this.sessions.has(entry.sessionId) || this.replaced.has(entry.sessionId)) continue;
      const who = await this.deps.identifyByCwd(entry.cwd);
      if (!who || this.sessions.has(entry.sessionId) || this.replaced.has(entry.sessionId)) {
        continue;
      }
      const session = this.link(entry.sessionId, who);
      if (session) this.move(session, fromAgent(entry, now));
    }
  }

  private linkFor(header: string | undefined, event: HookEvent): Linked | null {
    const known = this.sessions.get(event.session_id);
    if (known) return known;
    if (this.replaced.has(event.session_id)) return null;
    const who = identify(header, event.cwd, this.launches);
    return who ? this.link(event.session_id, who) : null;
  }

  /** Newest Session wins its target: an older one there is dropped with its feed. */
  private link(sessionId: string, who: LinkTarget): Linked | null {
    const now = this.deps.now();
    for (const older of this.sessions.values()) {
      if (older.repo !== who.repo || !sameTarget(older.target, who.target)) continue;
      older.hold?.end({ code: 'dropped' });
      this.sessions.delete(older.sessionId);
      this.replaced.add(older.sessionId);
      if (this.replaced.size > MAX_REPLACED) {
        this.replaced.delete(this.replaced.values().next().value!);
      }
      this.emit({ type: 'drop', sessionId: older.sessionId });
    }
    const session: Linked = {
      sessionId,
      repo: who.repo,
      target: who.target,
      startedAt: now,
      cell: { state: 'working', waiting: null, since: now },
      question: null,
      note: null,
      peek: [],
      hold: null,
    };
    this.sessions.set(sessionId, session);
    this.emit({ type: 'status', session: this.status(session) });
    this.schedule();
    return session;
  }

  /** A prompt typed in the terminal drops the board's hold. A hook on a Lost Session proves its process is back. */
  private record(session: Linked, event: HookEvent): void {
    if (session.cell.state === 'ended') return;
    const now = this.deps.now();
    const line = peekLine(event, now);
    if (line) this.addPeek(session, line);
    const typed = event.hook_event_name === 'UserPromptSubmit' && !isWakePrompt(event.prompt);
    const answeredAsk =
      event.hook_event_name === 'PostToolUse' && event.tool_name === 'AskUserQuestion';
    if (typed || answeredAsk) session.hold?.end({ code: 'dropped' });
    this.move(session, afterHook(session.cell, event, now));
  }

  private addPeek(session: Linked, line: PeekLine): void {
    session.peek.push(line);
    session.peek.splice(0, session.peek.length - PEEK_LINES);
    this.emit({ type: 'peek', sessionId: session.sessionId, line });
  }

  private hold(
    session: Linked,
    question: SessionQuestion,
    signal: AbortSignal,
    hookStarted: number | null = null,
  ): Promise<HoldEnd> {
    session.hold?.end({ code: 'dropped' });
    session.question = question;
    session.note = null;
    const now = this.deps.now();
    const full = (HOLD_TIMEOUT_S - HOLD_MARGIN_S) * 1000;
    const wait =
      hookStarted === null ? full : Math.max(0, Math.min(full, hookStarted + full - now.getTime()));
    const asking = question.kind !== 'reply';
    this.move(
      session,
      asking
        ? { state: 'asking', waiting: null, since: now }
        : { state: 'waiting', waiting: 'turn-end', since: now },
      { force: true },
    );
    return new Promise((resolve) => {
      const timer = setTimeout(() => hold.end({ code: 'timed-out' }), wait);
      const onAbort = () => hold.end({ code: 'dropped' });
      const hold: Hold = {
        questionId: question.id,
        typing: false,
        end: (outcome) => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          if (session.hold === hold) {
            session.hold = null;
            session.question = null;
            if (outcome.code === 'timed-out') session.note = { code: 'timed-out' };
            this.emit({ type: 'status', session: this.status(session) });
          }
          resolve(outcome);
        },
      };
      session.hold = hold;
      if (signal.aborted) hold.end({ code: 'dropped' });
      else signal.addEventListener('abort', onAbort, { once: true });
      this.emit({ type: 'status', session: this.status(session) });
    });
  }

  /** With `force`, the caller emits the status itself once the hold is in place. */
  private move(session: Linked, cell: StateCell, { force = false } = {}): void {
    const same = cell.state === session.cell.state && cell.waiting === session.cell.waiting;
    if (same && !force) return;
    session.cell = same ? { ...cell, since: session.cell.since } : cell;
    if (!same) session.note = null;
    if (FINAL.has(cell.state)) session.hold?.end({ code: 'dropped' });
    if (!force) this.emit({ type: 'status', session: this.status(session) });
    if (!FINAL.has(cell.state)) this.schedule();
  }

  private schedule(): void {
    if (this.timer || this.polling) return;
    const live = [...this.sessions.values()].some((s) => !FINAL.has(s.cell.state));
    if (!live) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll();
    }, AGENTS_POLL_MS);
  }

  private emit(event: SessionEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private status(session: Linked): SessionStatus {
    return status(session, this.terminalOf(session) !== null);
  }

  /** Read at use, not at link: a Session's first hook can beat the end of its own Start. */
  private terminalOf(session: Linked): string | null {
    return this.launches.findLast((l) => sameLink(l, session))?.terminal ?? null;
  }
}

function sameLink(a: LinkTarget, b: LinkTarget): boolean {
  return a.repo === b.repo && sameTarget(a.target, b.target);
}

function status(s: Linked, typeable: boolean): SessionStatus {
  return {
    sessionId: s.sessionId,
    repo: s.repo,
    target: s.target,
    state: s.cell.state,
    waiting: s.cell.waiting,
    since: s.cell.since.toISOString(),
    startedAt: s.startedAt.toISOString(),
    question: s.question,
    note: s.note,
    typeable,
  };
}
