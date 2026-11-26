import type { IssueDetail } from '@contract/issue';
import type { StartSkill } from '@contract/gap';
import type { ReleaseRefusal } from '@contract/api';
import type { TakenReason } from '@contract/launch';
import type { IssueRef, Label } from '@contract/sky';
import type { TrackerKind } from '@contract/repo';

export type CloseReason = 'completed' | 'not-planned' | 'duplicate';

/** One issue as the Tracker holds it, before any GLOSSARY.md rule is applied. */
export interface RawIssue {
  id: string;
  handle: string;
  number: number | null;
  title: string;
  body: string;
  url: string | null;
  path: string | null;
  state: 'open' | 'closed';
  /** ISO time from GitHub's `createdAt` or the commit that added the `.scratch/` file. `null` outside git. */
  createdAt: string | null;
  closeReason: CloseReason | null;
  /** On `.scratch/`, triage words from `Status:` arrive here as colourless labels. */
  labels: Label[];
  assignees: string[];
  claim: { holder: string | null; since: string | null } | null;
  parentId: string | null;
  childIds: string[];
  children: { total: number; closed: number };
  blockedByIds: string[];
  outsideBlockers: string[];
  /** `map.md` / `spec.md` in `.scratch/`. `null` on GitHub, where labels and titles decide. */
  systemHint: 'map' | 'spec' | 'plain' | null;
  /** The `Type:` line in `.scratch/`, which makes a Decision ticket. */
  typeLine: string | null;
  /** The branch a System declares for its tickets. Always `null` in `.scratch/`. */
  base: string | null;
  /** The issue a GitHub body's `## Parent` section names. Always `null` in `.scratch/`. */
  namedParentId: string | null;
  flagged: boolean;
}

/** Open issues and the closed ones an open issue points at. `.scratch/` returns every issue. */
export interface RawGraph {
  tracker: TrackerKind;
  viewer: string | null;
  issues: RawIssue[];
}

/** A Release that found nothing to put back. The route sends `reason`, not the message. */
export class ReleaseRefused extends Error {
  readonly reason: ReleaseRefusal;

  constructor(id: string, status: string | null) {
    super(`release ${id}: not claimed, Status ${status ?? 'missing'}`);
    this.reason = { code: 'not-claimed', status };
  }
}

export interface Tracker {
  kind: TrackerKind;
  read(): Promise<RawGraph>;
  /** Reads the Tracker live, never the cached Sky. */
  taken(claim: { id: string; handle: string }): Promise<TakenReason | null>;
  /** A System's raw children, open and closed. */
  children(systemId: string): Promise<RawIssue[]>;
  isId(id: string): boolean;
  detail(id: string): Promise<IssueDetail>;
  /** The board's first write. Resolves to what `release` needs to put back. */
  claim(id: string): Promise<string | null>;
  /** Without `previous`, the adapter restores the default for the ticket's kind. */
  release(id: string, previous?: string | null): Promise<void>;
  /** The command lines the sheet and rollback show for `claim` and `release`. */
  claimCommand(id: string): string;
  releaseCommand(id: string): string;
  /** Idempotent, so unlike `claim` it takes no live pre-read. */
  flag(id: string, flagged: boolean): Promise<void>;
  flagCommand(id: string, flagged: boolean): string;
  /** The exact command `taken` runs, as the sheet's re-read step shows it. */
  takenCommand(id: string): string;
  skillArg(ref: IssueRef, skill: StartSkill): string;
  /** Follows the branch prefix. It holds no `/`, which would nest a folder under the worktree dir. */
  branchSlug(ref: IssueRef): string;
}
