import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { StartRequest } from '@contract/api';
import type {
  LaunchPlan,
  LaunchTarget,
  NewSessionSkill,
  PlanResult,
  SessionTarget,
  StartLabel,
  StartOption,
} from '@contract/launch';
import type { Claim } from '@contract/sky';
import { Api, ApiFailure } from '@app/api/api';
import { apiFailureText } from '@app/i18n/api-failure';
import { INSTALL_NOTE } from '@app/install-note/install-note';
import { I18nService } from '@app/i18n/i18n.service';
import { SkyView } from '@app/sky/sky-view';
import { Board } from '@app/state/board';
import { advance, begin, endEarly, phase, type Launch } from '@app/start/progress';

/** How long `✓ started` stays before the pill shows the new claim. */
const DONE_MS = 2600;

export const START: StartLabel = { code: 'ticket' };

/** The sheet key of the architecture Start. No star id holds a NUL, so it never names a star. */
export const ARCHITECTURE = '\0architecture';

const ARCHITECTURE_OPTION: StartOption = {
  enabled: true,
  target: { kind: 'architecture' },
  label: { code: 'architecture' },
};

/** The sheet key of a new session, kept apart from star ids the same way as `ARCHITECTURE`. */
export const SESSION = '\0session';

/** Each opening gets its own, so two new sessions in the container never share a tmux name. */
const sessionKey = () => Date.now().toString(36);

/** A sheet key that names no star. Its sheet sits in the corner, not on the sky. */
export const isRepoStart = (id: string) => id === ARCHITECTURE || id === SESSION;

export type Planned = PlanResult | { ok: false; error: unknown };

interface PlanKey {
  repo: string;
  id: string;
  target: LaunchTarget;
  readAt: string;
}

const keyOf = (repo: string | null, id: string) => `${repo ?? ''}\n${id}`;

@Injectable({ providedIn: 'root' })
export class Start {
  private readonly api = inject(Api);
  private readonly board = inject(Board);
  private readonly view = inject(SkyView);
  private readonly i18n = inject(I18nService);

  readonly installNote = inject(INSTALL_NOTE);

  private readonly launches = signal<ReadonlyMap<string, Launch>>(new Map());
  private readonly spinningKeys = signal<ReadonlySet<string>>(new Set());
  readonly running = computed(() =>
    [...this.launches().values()].some((l) => phase(l) === 'running'),
  );

  private readonly opened = signal<string | null>(null);
  private readonly selected = computed(() => {
    const selection = this.view.selection();
    return selection?.kind === 'star' ? selection.id : null;
  });
  readonly sheet = computed(() => {
    const open = this.opened();
    return open !== null && (isRepoStart(open) || open === this.selected()) ? open : null;
  });

  private readonly session = signal<SessionTarget>({ kind: 'session', key: sessionKey() });
  /** The first message and skill typed into the new-session sheet. */
  readonly sessionTarget = this.session.asReadonly();

  private readonly planned = signal<Planned | null>(null);
  private readonly resolvedBase = signal<LaunchPlan['base']>(null);
  private readonly branchList = signal<string[]>([]);
  private readonly chosenBase = signal<string | null>(null);
  readonly plan = this.planned.asReadonly();
  readonly resolved = this.resolvedBase.asReadonly();
  readonly branches = this.branchList.asReadonly();
  /** The Base picked in the sheet. `null` keeps the resolved one. */
  readonly chosen = this.chosenBase.asReadonly();

  private readonly planKey = computed<PlanKey | null>(
    () => {
      const id = this.sheet();
      const repo = this.board.activePath();
      const option = id ? this.optionFor(id) : null;
      if (!id || !repo || !option?.enabled || this.launchFor(id)) return null;
      return { repo, id, target: option.target, readAt: this.board.skyResponse()?.readAt ?? '' };
    },
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  private seq = 0;
  private planFor: string | null = null;

  constructor() {
    effect(() => {
      const prefix = keyOf(this.board.activePath(), '');
      const ids = new Set<string>();
      for (const key of this.spinningKeys()) {
        if (key.startsWith(prefix)) ids.add(key.slice(prefix.length));
      }
      this.view.spinning.set(ids);
    });
    effect(() => {
      const open = this.opened();
      if (open === null) return;
      const unselected = !isRepoStart(open) && open !== this.selected();
      if (unselected || !this.opens(open)) untracked(() => this.close());
    });
    effect(() => {
      const key = this.planKey();
      untracked(() => void this.load(key));
    });
  }

  /** The server's option, disabled by the first Start-blocking Gap that covers it. */
  optionFor(id: string): StartOption | null {
    const option =
      id === ARCHITECTURE
        ? this.architecture()
        : id === SESSION
          ? this.newSession()
          : this.board.starts()[id];
    if (!option?.enabled) return option ?? null;
    const gap = this.board
      .gaps()
      .find(
        (g) =>
          g.tier === 'start' &&
          g.blocks.includes(option.target.kind) &&
          (g.ids.length === 0 || g.ids.includes(id)),
      );
    if (!gap) return option;
    return { enabled: false, target: option.target, reason: { code: 'gap', problem: gap.problem } };
  }

  private architecture(): StartOption | null {
    return this.board.sky() && !this.board.fatalGap() ? ARCHITECTURE_OPTION : null;
  }

  /**
   * Needs a valid Tracker, not a Sky: a failed read leaves it open. `readFailure` is not in
   * `gaps`, so only a missing Tracker or machine hides it.
   */
  private newSession(): StartOption | null {
    if (!this.board.activePath() || this.board.gaps().some((g) => g.tier === 'fatal')) return null;
    return { enabled: true, target: this.session(), label: { code: 'session' } };
  }

  /** An empty message or `null` skill drops the field, so the plan runs plain `claude`. */
  editSession(change: { prompt?: string; skill?: NewSessionSkill | null }): void {
    this.session.update(({ kind, key, prompt, skill }) => {
      const nextPrompt = change.prompt ?? prompt;
      const nextSkill = change.skill === undefined ? skill : change.skill;
      return {
        kind,
        key,
        ...(nextPrompt ? { prompt: nextPrompt } : {}),
        ...(nextSkill ? { skill: nextSkill } : {}),
      };
    });
  }

  launchFor(id: string): Launch | null {
    return this.launches().get(keyOf(this.board.activePath(), id)) ?? null;
  }

  claimFor(id: string): Claim | null {
    const star = this.board.sky()?.index.get(id)?.star;
    return star?.kind === 'ticket' ? star.ticket.claim : null;
  }

  opens(id: string): boolean {
    if (this.launchFor(id)) return true;
    return !this.claimFor(id) && !!this.optionFor(id)?.enabled;
  }

  labelFor(id: string | null): StartLabel {
    const option = id ? this.optionFor(id) : null;
    return option?.enabled ? option.label : START;
  }

  open(id: string): void {
    this.opened.set(id);
  }

  close(): void {
    this.opened.set(null);
  }

  toggle(id: string): void {
    if (this.sheet() === id) this.close();
    else this.open(id);
  }

  /** A running launch is kept, only its sheet closes. */
  dismiss(id: string): void {
    const key = keyOf(this.board.activePath(), id);
    if (this.launches().get(key)?.end) this.drop(key);
    this.close();
  }

  pickBase(branch: string): void {
    const resolved = this.resolvedBase();
    this.chosenBase.set(resolved && branch === resolved.branch ? null : branch);
    const key = this.planKey();
    if (key) void this.replan(key, ++this.seq);
  }

  async start(id: string, plan: LaunchPlan): Promise<void> {
    const repo = this.board.activePath();
    if (!repo || this.running()) return;
    const key = keyOf(repo, id);
    const base = this.chosenBase();
    const request: StartRequest = { repo, target: plan.target, ...(base ? { base } : {}) };
    let launch = begin(repo, plan.target, this.labelFor(id), plan);
    const put = (next: Launch) => {
      launch = next;
      this.launches.update((all) => new Map(all).set(key, next));
    };
    put(launch);
    this.spin(key, true);
    try {
      for await (const event of this.api.start(request)) put(advance(launch, event));
      if (!launch.end) put(endEarly(launch, { code: 'cut-short' }));
    } catch (error) {
      put(endEarly(launch, { code: 'crashed', error: this.errorText(error) }));
    } finally {
      this.spin(key, false);
    }
    if (phase(launch) !== 'done') return;
    if (id === SESSION) this.session.set({ kind: 'session', key: sessionKey() });
    const done = launch;
    await this.board.readSky({ fresh: true });
    if (done.plan.tmux !== null) return;
    setTimeout(() => {
      if (this.launches().get(key) !== done) return;
      this.drop(key);
      if (this.opened() === id && this.board.activePath() === repo) this.close();
    }, DONE_MS);
  }

  private errorText(error: unknown): string {
    if (error instanceof ApiFailure) {
      return apiFailureText(error.body, this.i18n.messages().board.codes);
    }
    return error instanceof Error ? error.message : String(error);
  }

  private async load(key: PlanKey | null): Promise<void> {
    const seq = ++this.seq;
    if (!key) {
      this.planFor = null;
      return;
    }
    const opened = keyOf(key.repo, key.id);
    if (opened !== this.planFor) {
      this.planFor = opened;
      this.chosenBase.set(null);
      this.planned.set(null);
      this.resolvedBase.set(null);
      this.branchList.set([]);
      void this.loadBranches(key.repo, opened);
    }
    await this.replan(key, seq);
  }

  private async replan(key: PlanKey, seq: number): Promise<void> {
    const current = () => seq === this.seq;
    const { repo, target } = key;
    try {
      const plain = await this.api.plan({ repo, target });
      if (!current()) return;
      this.resolvedBase.set(plain.ok ? plain.plan.base : null);
      const chosen = this.chosenBase();
      if (!plain.ok || !plain.plan.base || !chosen || chosen === plain.plan.base.branch) {
        this.planned.set(plain);
        return;
      }
      const overridden = await this.api.plan({ repo, target, ...(chosen ? { base: chosen } : {}) });
      if (current()) this.planned.set(overridden);
    } catch (error) {
      if (current()) this.planned.set({ ok: false, error });
    }
  }

  private async loadBranches(repo: string, opened: string): Promise<void> {
    try {
      const { branches } = await this.api.branches(repo);
      if (this.planFor === opened) this.branchList.set(branches);
    } catch {
      if (this.planFor === opened) this.branchList.set([]);
    }
  }

  private drop(key: string): void {
    this.launches.update((all) => {
      const next = new Map(all);
      next.delete(key);
      return next;
    });
  }

  private spin(key: string, on: boolean): void {
    this.spinningKeys.update((keys) => {
      const next = new Set(keys);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }
}
