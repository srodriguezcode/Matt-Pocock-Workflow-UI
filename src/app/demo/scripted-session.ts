import type {
  AnswerRequest,
  AnswerResponse,
  PeekLine,
  SessionEvent,
  SessionState,
  SessionStatus,
  SessionView,
} from '@contract/session';
import { LATE_LOAN_ID, SHELF_PATH } from './mock';
import {
  AFTER_ROUND,
  BEFORE_ROUND,
  DROP_AFTER,
  ENDED_AFTER,
  roundQuestion,
  type ScriptLine,
  type Step,
} from './scripted-session-script';

type Listener = (event: SessionEvent) => void;

export class ScriptedSession {
  private readonly listeners = new Set<Listener>();
  private status: SessionStatus | null = null;
  private peek: PeekLine[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private loop = 0;

  open(listener: Listener): () => void {
    this.listeners.add(listener);
    if (!this.status) this.begin();
    listener({ type: 'snapshot', sessions: this.view() });
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  answer(request: AnswerRequest): Promise<AnswerResponse> {
    const { status } = this;
    const held = status?.question;
    if (
      !status ||
      status.state !== 'asking' ||
      status.sessionId !== request.sessionId ||
      held?.id !== request.questionId
    ) {
      return Promise.resolve({ code: 'gone' });
    }
    this.set('working', null);
    this.say(answerLine(request));
    this.play(AFTER_ROUND, () => this.end());
    return Promise.resolve({ code: 'sent' });
  }

  private begin(): void {
    this.loop += 1;
    const now = new Date().toISOString();
    this.peek = [];
    this.status = {
      sessionId: `demo-session-${this.loop}`,
      repo: SHELF_PATH,
      target: { kind: 'decision', id: LATE_LOAN_ID },
      state: 'working',
      waiting: null,
      since: now,
      startedAt: now,
      question: null,
      note: null,
      typeable: false,
    };
    this.play(BEFORE_ROUND, () => this.ask());
  }

  private ask(): void {
    this.set('asking', roundQuestion(`demo-question-${this.loop}`));
  }

  private end(): void {
    this.timer = setTimeout(() => {
      this.set('ended', null);
      this.timer = setTimeout(() => this.drop(), DROP_AFTER);
    }, ENDED_AFTER);
  }

  private drop(): void {
    const sessionId = this.status?.sessionId;
    this.status = null;
    this.peek = [];
    if (sessionId) this.emit({ type: 'drop', sessionId });
    this.begin();
    if (this.status) this.emit({ type: 'status', session: this.status });
  }

  private play(steps: Step[], done: () => void): void {
    const [step, ...rest] = steps;
    if (!step) return done();
    this.timer = setTimeout(() => {
      this.say(step.line);
      this.play(rest, done);
    }, step.after);
  }

  private say(line: ScriptLine): void {
    const sessionId = this.status?.sessionId;
    if (!sessionId) return;
    const full = { ...line, at: new Date().toISOString() };
    this.peek.push(full);
    this.emit({ type: 'peek', sessionId, line: full });
  }

  private set(state: SessionState, question: SessionStatus['question']): void {
    if (!this.status) return;
    this.status = { ...this.status, state, question, since: new Date().toISOString() };
    this.emit({ type: 'status', session: this.status });
  }

  private emit(event: SessionEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  private view(): SessionView[] {
    return this.status ? [{ ...this.status, peek: [...this.peek] }] : [];
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.status = null;
    this.peek = [];
  }
}

function answerLine(request: AnswerRequest): ScriptLine {
  const text =
    request.kind === 'round'
      ? request.answers
          .map(({ number, key, text }) => `${number} ${text?.trim() || key || ''}`.trim())
          .join(' / ')
      : '';
  return { kind: 'prompt', tool: null, text, full: text, human: false };
}
