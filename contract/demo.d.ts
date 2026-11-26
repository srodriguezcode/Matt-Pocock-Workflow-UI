import type {
  BranchesResponse,
  ClosedRoute,
  GapsResponse,
  ReleaseResponse,
  SkyResponse,
} from './api.d.ts';
import type { IssueDetail } from './issue.d.ts';
import type { LaunchTarget, PlanResult } from './launch.d.ts';
import type { RepoConfig } from './repo.d.ts';

export interface DemoPlan {
  target: LaunchTarget;
  result: PlanResult;
}

export type DemoRefusal = ReleaseResponse['failed'][number];

export interface DemoRelease {
  sky: SkyResponse;
  /** Keyed by ticket id, one per ticket in the released set. */
  issues: Record<string, IssueDetail>;
  plans: DemoPlan[];
  refusals: Record<string, DemoRefusal>;
}

export interface DemoRepoSnapshot {
  repo: RepoConfig;
  sky: SkyResponse;
  /** Keyed by issue id. Holds every star in the Sky and every child in `routes`. */
  issues: Record<string, IssueDetail>;
  /** Keyed by System id, one per open System. */
  routes: Record<string, ClosedRoute>;
  /** One per enabled Start and one for `architecture`. None has a Base override. */
  plans: DemoPlan[];
  /** Keyed by ticket id, one per open ticket that is not claimed. What `/api/release` answers. */
  refusals: Record<string, DemoRefusal>;
  /**
   * Keyed by the released ticket ids, sorted and joined with `,`, as in `a/01,b/02`.
   * One per non-empty set of claimed tickets: what the board reads after the Release of that set.
   */
  releases: Record<string, DemoRelease>;
  gaps: GapsResponse;
  branches: BranchesResponse;
}

/** What the Demo reads in place of `/api`. `repos` is in Rail order. */
export interface DemoSnapshot {
  repos: DemoRepoSnapshot[];
}
