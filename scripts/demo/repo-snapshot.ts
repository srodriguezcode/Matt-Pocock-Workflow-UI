import { join } from 'node:path';
import type { BranchesResponse, ClosedRoute, SkyResponse } from '@contract/api';
import type { DemoPlan, DemoRefusal, DemoRelease, DemoRepoSnapshot } from '@contract/demo';
import type { IssueDetail } from '@contract/issue';
import type { LaunchTarget } from '@contract/launch';
import type { RepoConfig } from '@contract/repo';
import type { Ticket } from '@contract/sky';
import { withDefaults } from '#server/config/store.ts';
import { planStart } from '#server/launch/plan.ts';
import { sessionSettingsPath } from '#server/session/settings-file.ts';
import { readClosedRoute } from '#server/sky/closed-route.ts';
import { buildSky } from '#server/sky/model.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { FakeTracker } from '#server/testing/fake-tracker.ts';
import { detectTracker } from '#server/tracker/detect.ts';
import { scratchTracker } from '#server/tracker/scratch/adapter.ts';
import { ReleaseRefused, type RawGraph, type Tracker } from '#server/tracker/tracker.ts';
import type { Dates, MockRepo } from './mock-repo.ts';
import { applyOverlay, daysAgo } from './overlay.ts';

export const OWNER = 'ana-reyes';
const HOME = `/Users/${OWNER}`;
/** Each claimed ticket doubles the boards the snapshot holds. */
const MAX_CLAIMED = 3;
const ORIGIN: BranchesResponse = { branches: ['main'], defaultBranch: 'main' };

export const repoPath = (name: string) => `${HOME}/code/${name}`;

interface Board {
  scratch: Tracker;
  raw: RawGraph;
  sky: SkyResponse;
  plans: DemoPlan[];
  refusals: Record<string, DemoRefusal>;
}

/** Reads one mock repo through the board's own server code, never a hand-built Sky. */
export async function snapshotRepo(mock: MockRepo, now: Date): Promise<DemoRepoSnapshot> {
  const path = repoPath(mock.name);
  const repo: RepoConfig = withDefaults({
    path,
    owner: OWNER,
    name: mock.name,
    tile: { image: `data:image/svg+xml;base64,${Buffer.from(mock.tile).toString('base64')}` },
  });
  const fs = new FakeFs(
    Object.fromEntries(Object.entries(mock.files).map(([file, text]) => [join(path, file), text])),
  );
  if ((await detectTracker(fs, path)) !== 'scratch')
    throw new Error(`demo/${mock.name} must declare the local markdown Tracker`);
  const board = await readBoard(mock, repo, fs, mock.dates.claimed, now);
  const { sky } = board.sky;
  const overlaid = new FakeTracker(board.raw);

  const routes: Record<string, ClosedRoute> = {};
  for (const system of sky.systems.filter((s) => !s.closed))
    routes[system.id] = await readClosedRoute(overlaid, system.id);

  const shown = [
    ...[...sky.systems, ...sky.tickets, ...sky.embers].map((star) => star.id),
    ...Object.values(routes).flatMap((route) => route.children.map((child) => child.id)),
  ];
  const issues: Record<string, IssueDetail> = {};
  for (const id of new Set(shown)) issues[id] = await board.scratch.detail(id);

  const claimed = sky.tickets.filter((t) => t.gate === 'in-flight');
  if (claimed.length > MAX_CLAIMED)
    throw new Error(
      `demo/${mock.name} claims ${claimed.length} tickets. The Demo holds ${MAX_CLAIMED} at most per repo.`,
    );
  const releases: Record<string, DemoRelease> = {};
  for (const set of subsets(claimed)) {
    const key = set
      .map((t) => t.id)
      .sort()
      .join(',');
    releases[key] = await readRelease(mock, repo, fs, set, now);
  }

  return {
    repo,
    sky: board.sky,
    issues,
    routes,
    plans: board.plans,
    refusals: board.refusals,
    releases,
    gaps: mock.gaps,
    branches: ORIGIN,
  };
}

async function readRelease(
  mock: MockRepo,
  repo: RepoConfig,
  fs: FakeFs,
  tickets: Ticket[],
  now: Date,
): Promise<DemoRelease> {
  const after = new FakeFs(Object.fromEntries(fs.files));
  const adapter = scratchTracker(after, new FakeRunner(), repo);
  for (const ticket of tickets) await adapter.release(ticket.id);
  const paths = new Set(tickets.map((t) => t.path));
  const claimed = Object.fromEntries(
    Object.entries(mock.dates.claimed).filter(([file]) => !paths.has(join(repo.path, file))),
  );
  const board = await readBoard(mock, repo, after, claimed, now);
  const issues: Record<string, IssueDetail> = {};
  for (const ticket of tickets) issues[ticket.id] = await board.scratch.detail(ticket.id);
  return { sky: board.sky, issues, plans: board.plans, refusals: board.refusals };
}

function subsets<T>(items: T[]): T[][] {
  return items.reduce<T[][]>(
    (sets, item) => [...sets, [item], ...sets.map((set) => [...set, item])],
    [],
  );
}

async function readBoard(
  mock: MockRepo,
  repo: RepoConfig,
  fs: FakeFs,
  claimed: Dates['claimed'],
  now: Date,
): Promise<Board> {
  const runner = new FakeRunner().on(['git', '-c', 'core.quotePath=false', 'log'], {
    stdout: gitLog(mock, now),
  });
  const scratch = scratchTracker(fs, runner, repo);
  const raw = applyOverlay(await scratch.read(), repo.path, mock.overlay, claimed, now);
  const { sky, starts } = buildSky(raw, repo.labels, now);

  const targets: LaunchTarget[] = [
    ...Object.values(starts).flatMap((option) => (option.enabled ? [option.target] : [])),
    { kind: 'architecture' },
  ];
  const plans = targets.map((target) => ({
    target,
    result: planStart({
      sky,
      option: target.kind === 'architecture' ? undefined : starts[target.id],
      repo,
      target,
      link: { settingsPath: sessionSettingsPath(HOME) },
      base: null,
      origin: ORIGIN,
      local: { branches: ['main'], worktrees: [repo.path] },
      commands: {
        reread: (id) => scratch.takenCommand(id),
        claim: (id) => scratch.claimCommand(id),
        skillArg: (ref, skill) => scratch.skillArg(ref, skill),
        branchSlug: (ref) => scratch.branchSlug(ref),
      },
    }),
  }));

  const refusals: Record<string, DemoRefusal> = {};
  for (const ticket of sky.tickets.filter((t) => t.gate !== 'in-flight'))
    refusals[ticket.id] = await refusal(scratch, ticket.id);

  return { scratch, raw, sky: { sky, starts, readAt: now.toISOString() }, plans, refusals };
}

async function refusal(scratch: Tracker, id: string): Promise<DemoRefusal> {
  try {
    await scratch.release(id);
  } catch (error) {
    const reason = error instanceof ReleaseRefused ? { reason: error.reason } : {};
    return { id, error: (error as Error).message, ...reason };
  }
  throw new Error(`${id} is not In flight, yet its Release went through`);
}

function gitLog(mock: MockRepo, now: Date): string {
  const tickets = Object.keys(mock.files).filter(
    (file) => file.startsWith('.scratch/') && file.endsWith('.md'),
  );
  for (const file of tickets)
    if (!(file in mock.dates.created))
      throw new Error(`demo/${mock.name}/dates.json lacks ${file}`);
  return Object.entries(mock.dates.created)
    .map(([file, days]) => {
      if (!(file in mock.files)) throw new Error(`demo/${mock.name}/dates.json names ${file}`);
      return `@@${daysAgo(now, days)}\n\n${file}\n`;
    })
    .join('\n');
}
