import type { Gap } from './gap.d.ts';
import type { StartOption, LaunchTarget } from './launch.d.ts';
import type { Theme, Tile } from './repo.d.ts';
import type { Runtime } from './runtime.d.ts';
import type { ClosedChild, Dependency, Sky } from './sky.d.ts';

/** A refusal the client words. `path` is the one the request named or git resolved. */
export type ApiErrorReason =
  | { code: 'not-a-checkout'; path: string }
  | { code: 'no-origin'; path: string }
  | { code: 'origin-not-github' }
  | { code: 'already-added'; path: string }
  | { code: 'bad-tile' }
  | { code: 'unknown-repo'; path: string }
  | { code: 'no-origin-head' }
  | { code: 'fixed-identity'; path: string }
  | { code: 'bad-base-branch'; branch: string }
  | { code: 'blank-prefix-label' }
  | { code: 'bad-branch-prefix'; prefix: string }
  | { code: 'bad-worktree-dir' }
  | { code: 'unknown-label'; label: string }
  | { code: 'blank-label-remap'; label: string }
  | { code: 'bad-theme' }
  | { code: 'flag-failed' }
  | { code: 'bad-repo-order' }
  | { code: 'not-a-repo'; repo: string }
  | { code: 'by-name-needs-container' }
  | { code: 'tab-closed' }
  | { code: 'type-failed'; stderr: string };

/** Body of every non-2xx `/api` reply. A fatal Gap rides along when one caused it. */
export interface ApiError {
  /** Raw, for logs. The client shows it only when neither `reason` nor `gap` is set. */
  error: string;
  reason?: ApiErrorReason;
  gap?: Gap;
}

export interface SkyResponse {
  sky: Sky;
  starts: Record<string, StartOption>;
  readAt: string;
}

/** `GET /api/route?repo=&id=`: what an open System already closed, read when it is selected. */
export interface ClosedRoute {
  systemId: string;
  children: ClosedChild[];
  /** Out of the closed children, into closed and open siblings alike. All satisfied. */
  lanes: Dependency[];
}

export interface BranchesResponse {
  branches: string[];
  defaultBranch: string;
}

/** A checkout `path` on the Mac. In the container runtime, `github` is `owner/name`, cloned under `/repos`. */
export type AddRepoRequest = { path: string; tile?: Tile } | { github: string; tile?: Tile };

/** `PUT /api/repos/order`: every saved repo path once, in the new Rail order. */
export interface ReorderReposRequest {
  paths: string[];
}

export interface PlanRequest {
  repo: string;
  target: LaunchTarget;
  base?: string;
}

export type StartRequest = PlanRequest;

export interface ReleaseRequest {
  repo: string;
  ids: string[];
}

/** Why a Release left a ticket as it was. `status` is the `Status:` value found, `null` for no line. */
export type ReleaseRefusal = { code: 'not-claimed'; status: string | null };

export interface ReleaseResponse {
  released: string[];
  /** `error` is raw, for logs. The client shows it only when `reason` is not set. */
  failed: { id: string; error: string; reason?: ReleaseRefusal }[];
}

/** `POST /api/flag`. The success reply has an empty body. */
export interface FlagRequest {
  repo: string;
  id: string;
  flagged: boolean;
}

export interface GapsResponse {
  gaps: Gap[];
}

/** `GET` and `PUT /api/settings`: the per-machine choices that are not about one repo. */
export interface Settings {
  theme: Theme;
}

export interface RuntimeResponse {
  runtime: Runtime;
}
