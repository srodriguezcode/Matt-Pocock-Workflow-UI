import type {
  BranchesResponse,
  ClosedRoute,
  GapsResponse,
  PlanRequest,
  ReleaseResponse,
  SkyResponse,
} from '@contract/api';
import type { DemoRepoSnapshot, DemoSnapshot } from '@contract/demo';
import type { IssueDetail } from '@contract/issue';
import type { LaunchTarget, PlanResult } from '@contract/launch';
import type { RepoConfig } from '@contract/repo';
import type { Sky } from '@contract/sky';

export async function loadSnapshot(
  url: string,
  get: (url: string) => Promise<Response> = (target) => fetch(target),
): Promise<DemoSnapshot | null> {
  const response = await get(url);
  return response.ok ? ((await response.json()) as DemoSnapshot) : null;
}

const idOf = (target: LaunchTarget) => ('id' in target ? target.id : null);
const sameTarget = (a: LaunchTarget, b: LaunchTarget) => a.kind === b.kind && idOf(a) === idOf(b);

export class DemoStore {
  private readonly snapshot: DemoSnapshot;
  private readonly flags = new Map<string, Map<string, boolean>>();
  private readonly released = new Map<string, Set<string>>();

  constructor(snapshot: DemoSnapshot) {
    this.snapshot = structuredClone(snapshot);
  }

  repos(): RepoConfig[] {
    return this.snapshot.repos.map((repo) => structuredClone(repo.repo));
  }

  sky(path: string): SkyResponse | null {
    return copy(this.find(path)?.sky);
  }

  issue(path: string, id: string): IssueDetail | null {
    return copy(this.find(path)?.issues[id]);
  }

  route(path: string, id: string): ClosedRoute | null {
    return copy(this.find(path)?.routes[id]);
  }

  gaps(path: string | null): GapsResponse | null {
    if (path === null) return { gaps: [] };
    return copy(this.find(path)?.gaps);
  }

  branches(path: string): BranchesResponse | null {
    return copy(this.find(path)?.branches);
  }

  /** No plan has a Base override. The picker offers only `main`, so no override arrives here. */
  plan(request: PlanRequest): PlanResult | null {
    const repo = this.find(request.repo);
    if (!repo) return null;
    const planned = repo.plans.find((p) => sameTarget(p.target, request.target));
    if (planned) return structuredClone(planned.result);
    const id = idOf(request.target);
    const option = id === null ? undefined : repo.sky.starts[id];
    return option && !option.enabled
      ? { ok: false, reason: structuredClone(option.reason) }
      : { ok: false, reason: { code: 'gone' } };
  }

  flag(path: string, id: string, flagged: boolean): boolean {
    const repo = this.find(path);
    if (!repo || !applyFlag(repo.sky, id, flagged)) return false;
    const flags = this.flags.get(path) ?? new Map<string, boolean>();
    this.flags.set(path, flags.set(id, flagged));
    return true;
  }

  release(path: string, ids: string[]): ReleaseResponse | null {
    const repo = this.find(path);
    if (!repo) return null;
    const done = this.released.get(path) ?? new Set<string>();
    this.released.set(path, done);
    const response: ReleaseResponse = { released: [], failed: [] };
    for (const id of ids) {
      const release = done.has(id) ? undefined : repo.releases[[...done, id].sort().join(',')];
      if (release) {
        done.add(id);
        repo.sky = release.sky;
        Object.assign(repo.issues, release.issues);
        repo.plans = release.plans;
        repo.refusals = release.refusals;
        for (const [flaggedId, flagged] of this.flags.get(path) ?? [])
          applyFlag(repo.sky, flaggedId, flagged);
        response.released.push(id);
      } else {
        response.failed.push(repo.refusals[id] ?? { id, error: `Demo: no ticket ${id}` });
      }
    }
    return structuredClone(response);
  }

  /** `null` for an order that skips, repeats or adds a repo, the same as the server's `bad-repo-order`. */
  reorder(paths: string[]): RepoConfig[] | null {
    const byPath = new Map(this.snapshot.repos.map((repo) => [repo.repo.path, repo]));
    const ordered = [...new Set(paths)].flatMap((path) => byPath.get(path) ?? []);
    if (ordered.length !== paths.length || ordered.length !== this.snapshot.repos.length)
      return null;
    this.snapshot.repos = ordered;
    return this.repos();
  }

  private find(path: string): DemoRepoSnapshot | undefined {
    return this.snapshot.repos.find((repo) => repo.repo.path === path);
  }
}

function copy<T>(value: T | undefined): T | null {
  return value === undefined ? null : structuredClone(value);
}

function applyFlag({ sky }: SkyResponse, id: string, flagged: boolean): boolean {
  const ticket = sky.tickets.find((t) => t.id === id);
  const system = sky.systems.find((s) => s.id === id);
  if (!ticket && !system) return false;
  if (ticket) ticket.flagged = flagged;
  if (system) system.flagged = flagged;
  countFlaggedTickets(sky);
  return true;
}

/** Mirrors `server/sky/flagged.ts`. */
function countFlaggedTickets(sky: Sky): void {
  for (const system of sky.systems)
    system.flaggedTickets =
      system.kind === 'map'
        ? 0
        : sky.tickets.filter((t) => t.systemId === system.id && t.flagged).length;
}
