import type { GapProblem } from './gap.d.ts';

/** `split` is a Split frontier Spec: the Start runs `/to-tickets` on it. */
export type StarKind = 'ticket' | 'system' | 'decision' | 'map' | 'split';

/** `architecture` Starts on the repo itself and carries no star id. */
export type LaunchKind = StarKind | 'architecture';

export interface StarTarget {
  kind: StarKind;
  id: string;
}

export type LaunchTarget = StarTarget | { kind: 'architecture' };

/** `count` is the tickets a Frontier system starts. */
export type StartLabel =
  | { code: 'ticket' }
  | { code: 'decision' }
  | { code: 'map' }
  | { code: 'system'; count: number }
  | { code: 'split' }
  | { code: 'architecture' };

/**
 * Why a star can't start, first match wins. `blockers` are handles, plus outside text on `blocked-from-outside`.
 * `outside` is outside-blocker text, `system` a short name cut from the issue title.
 */
export type StartReason =
  | { code: 'no-map' }
  | { code: 'off-map' }
  | { code: 'in-flight'; holder: string | null; mine: boolean }
  | { code: 'undecided'; label: string | null }
  | { code: 'blocked-by'; blockers: string[]; outside: string[] }
  | { code: 'gated'; blockers: string[]; system: string }
  | { code: 'ready-for-human' }
  | { code: 'no-readiness' }
  | { code: 'no-decision-frontier' }
  | { code: 'no-tickets' }
  | { code: 'spent' }
  | { code: 'system-gated'; blockers: string[] }
  | { code: 'child-system'; handle: string }
  | { code: 'ticket-in-flight'; handle: string }
  | { code: 'ticket-decision'; handle: string }
  | { code: 'ticket-undecided'; handle: string }
  | { code: 'ticket-ready-for-human'; handle: string }
  | { code: 'ticket-no-readiness'; handle: string }
  | { code: 'blocked-from-outside'; handle: string; blockers: string[] }
  | { code: 'not-frontier-system' }
  | { code: 'splitting' }
  | { code: 'gap'; problem: GapProblem };

/** What the pill offers for one star. Stars with nothing to offer have no entry. */
export type StartOption =
  | { enabled: true; target: LaunchTarget; label: StartLabel }
  | { enabled: false; target: LaunchTarget | null; reason: StartReason };

/** Why a plan was refused: the star's own reason, or what changed since the pill was drawn. */
export type PlanRefusal =
  | StartReason
  | { code: 'gone' }
  | { code: 'nothing-to-start' }
  | { code: 'base-missing'; branch: string };

export type StepKey = 'reread' | 'base' | 'claim' | 'fetch' | 'prune' | 'worktree' | 'terminal';

/** What one step does. `handles` holds every claimed issue, and the client words one and many apart. */
export type StepAction =
  | { code: 'reread'; handles: string[] }
  | { code: 'check-base'; branch: string }
  | { code: 'claim'; handles: string[] }
  | { code: 'fetch' }
  | { code: 'worktree-resume'; branch: string }
  | { code: 'worktree-on-branch'; branch: string }
  | { code: 'worktree-new'; branch: string; base: string }
  | { code: 'worktree-detach'; base: string }
  | { code: 'worktree-reset'; base: string }
  | { code: 'prune' }
  | { code: 'open-tab' }
  | { code: 'open-tmux'; name: string };

export interface PlanStep {
  key: StepKey;
  action: StepAction;
  commands: string[];
}

export type BaseSource = 'system' | 'repo' | 'default' | 'override';

export interface LaunchPlan {
  target: LaunchTarget;
  /** The slash command the session starts with, e.g. `/implement #613`. */
  skill: string;
  /** `null` for Starts that run in the main checkout. */
  base: { branch: string; source: BaseSource; systemId: string | null } | null;
  branch: string | null;
  worktree: string | null;
  /** What already exists, so this Start neither creates nor rolls it back. */
  reuse: { branch: boolean; worktree: boolean };
  cwd: string;
  /** The exact text written to the terminal tab. */
  command: string;
  /** The tmux session a container Start opens, else `null`. */
  tmux: string | null;
  claims: string[];
  steps: PlanStep[];
}

export type PlanResult = { ok: true; plan: LaunchPlan } | { ok: false; reason: PlanRefusal };

/** Someone got there between the plan and the Start. */
export type TakenReason =
  | { code: 'closed'; handle: string }
  | { code: 'held'; handle: string; holder: string }
  | { code: 'claimed'; handle: string };

export type RollbackResult = 'nothing-changed' | 'rolled-back' | 'rollback-incomplete';

/** A step failure the client words, when the failed command's stderr says nothing. */
export type StepFailure = { code: 'base-missing'; branch: string };

/** How a Start ended. `crashed` carries the raw error of a failure nobody named. */
export type LaunchOutcome =
  | { code: 'opened'; command: string }
  | { code: 'taken'; taken: TakenReason }
  | { code: 'step-failed'; action: StepAction; rollback: RollbackResult; reason?: StepFailure }
  | { code: 'refused'; reason: PlanRefusal }
  | { code: 'crashed'; error: string };

export type LaunchEvent =
  | { type: 'step'; index: number; key: StepKey; status: 'running' | 'done' }
  | { type: 'step'; index: number; key: StepKey; status: 'failed'; stderr: string }
  | { type: 'taken'; taken: TakenReason }
  | { type: 'rollback'; command: string; ok: boolean; stderr: string | null }
  | { type: 'end'; ok: boolean; outcome: LaunchOutcome };
