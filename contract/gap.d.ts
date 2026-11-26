import type { LaunchKind } from './launch.d.ts';

/** `fatal` shows no sky, `start` disables some Starts, `thin` only thins the sky. */
export type GapTier = 'fatal' | 'start' | 'thin';

/** The skills a Start needs: the one it runs, and `/implement`, which both bundled skills call. */
export type StartSkill =
  | 'implement'
  | 'implement-ticket'
  | 'implement-parallel'
  | 'wayfinder'
  | 'to-tickets'
  | 'improve-codebase-architecture';

/** The client words both the title and the effect from this one code. */
export type GapProblem =
  | { code: 'gh-missing' }
  | { code: 'gh-unauthed' }
  | { code: 'git-missing' }
  | { code: 'claude-missing' }
  | { code: 'iterm-missing' }
  | { code: 'tracker-missing'; file: string }
  | { code: 'tracker-unsupported' }
  | { code: 'labels-missing' }
  | { code: 'sub-issues-deps' }
  | { code: 'skill-missing'; skill: StartSkill }
  | { code: 'base-off-origin'; handle: string }
  | { code: 'tickets-unlinked'; handle: string; count: number };

export type GapFix = { command: string } | { skill: string } | null;

export interface Gap {
  id: string;
  scope: 'machine' | 'repo';
  tier: GapTier;
  problem: GapProblem;
  fix: GapFix;
  /** Start kinds this Gap disables. Empty unless `tier` is `start`. */
  blocks: LaunchKind[];
  /** Stars it concerns, when only some. For a `start` Gap, empty means every star of a blocked kind. */
  ids: string[];
  /** Paths searched for a missing skill. */
  searched: string[];
}
