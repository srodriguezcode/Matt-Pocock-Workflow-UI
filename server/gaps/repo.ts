import type { Gap } from '@contract/gap';
import type { RepoConfig } from '@contract/repo';
import type { Deps } from '#server/http/types.ts';
import { detectTracker } from '#server/tracker/detect.ts';
import { checkBaseLines } from './base-lines.ts';
import { checkDependencies } from './dependencies.ts';
import { checkLabels } from './labels.ts';
import { checkSkills } from './skills.ts';
import { tryReadSky } from './sky.ts';
import { trackerGap } from './tracker-gap.ts';
import { unlinkedTickets } from './unlinked.ts';

export async function checkRepo(
  deps: Deps,
  repo: RepoConfig,
  boardCheckout: string,
): Promise<Gap[]> {
  const { runner, fs, home } = deps;
  const detected = await detectTracker(fs, repo.path);
  if (detected === 'missing' || detected === 'unsupported') return [trackerGap(detected)];
  const gaps: Gap[] = [];
  if (detected === 'github') {
    gaps.push(...(await checkLabels(runner, repo)));
    gaps.push(...(await checkDependencies(runner, repo)));
    gaps.push(...(await checkBaseLines(deps, repo)));
    gaps.push(...unlinkedTickets(await tryReadSky(deps, repo), repo));
  }
  gaps.push(...(await checkSkills(fs, repo, home, boardCheckout, deps.claudeConfigDir)));
  return gaps;
}
