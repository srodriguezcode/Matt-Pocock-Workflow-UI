import type { BranchesResponse } from '@contract/api';
import type { Gap, GapProblem } from '@contract/gap';
import type { LaunchTarget, PlanResult } from '@contract/launch';
import type { RepoConfig } from '@contract/repo';
import type { Sky } from '@contract/sky';
import { checkMachine } from '#server/gaps/machine.ts';
import { BOARD_CHECKOUT, checkSkills } from '#server/gaps/skills.ts';
import { originBranches } from '#server/git/origin.ts';
import type { Deps } from '#server/http/types.ts';
import { boardStarts } from '#server/sky/starts.ts';
import { skyFor } from '#server/sky/read.ts';
import { trackerFor } from '#server/tracker/pick.ts';
import type { Tracker } from '#server/tracker/tracker.ts';
import { localState } from './local.ts';
import { planSession, planStart } from './plan.ts';

/**
 * `fresh` for a Start: the preview may plan from the cached Sky, the Start may not. A new session
 * reads no Sky, so it starts even when the read fails, and `sky` comes back `null`.
 */
export async function prepareStart(
  deps: Deps,
  repo: RepoConfig,
  target: LaunchTarget,
  base: string | null,
  options: { fresh?: boolean } = {},
): Promise<{ result: PlanResult; tracker: Tracker; sky: Sky | null }> {
  const tracker = await trackerFor(deps, repo);
  if (target.kind === 'session') {
    const result = planSession({ repo, target, link: deps.link, runtime: deps.runtime });
    return { result, tracker, sky: null };
  }
  const always = target.kind === 'ticket' || target.kind === 'system';
  const early = always
    ? Promise.all([originBranches(deps.runner, repo.path), localState(deps.runner, repo.path)])
    : Promise.resolve([NO_ORIGIN, NO_LOCAL] as const);
  const { sky, starts } = await skyFor(deps, repo, tracker, options);
  const [origin, local] = await early;
  const live = deps.sessions.liveTargets();
  const shown = boardStarts(starts, { live, repo: repo.path });
  const result = planStart({
    sky,
    option: 'id' in target ? shown[target.id] : undefined,
    repo,
    target,
    link: deps.link,
    base,
    origin,
    local,
    runtime: deps.runtime,
    commands: {
      reread: (id) => tracker.takenCommand(id),
      claim: (id) => tracker.claimCommand(id),
      skillArg: (ref, skill) => tracker.skillArg(ref, skill),
      branchSlug: (ref) => tracker.branchSlug(ref),
    },
  });
  return { result, tracker, sky };
}

const NO_ORIGIN: BranchesResponse = { branches: [], defaultBranch: '' };
const NO_LOCAL = { branches: [], worktrees: [] };

/**
 * The first machine or skill Gap that disables this Start. The label, dependency and Base
 * checks cost GitHub calls, so they stay on `/api/gaps`.
 */
export async function startBlock(
  deps: Deps,
  repo: RepoConfig,
  target: LaunchTarget,
): Promise<GapProblem | null> {
  const [machine, skills] = await Promise.all([
    checkMachine(deps.runner, deps.fs, deps.home, deps.runtime),
    checkSkills(deps.fs, repo, deps.home, BOARD_CHECKOUT, deps.claudeConfigDir),
  ]);
  return [...machine, ...skills].find((gap) => blocks(gap, target))?.problem ?? null;
}

function blocks(gap: Gap, target: LaunchTarget): boolean {
  return (
    gap.tier === 'start' &&
    gap.blocks.includes(target.kind) &&
    (gap.ids.length === 0 || ('id' in target && gap.ids.includes(target.id)))
  );
}
