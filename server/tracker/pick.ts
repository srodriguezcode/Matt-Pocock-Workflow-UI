import type { RepoConfig } from '@contract/repo';
import { trackerGap } from '#server/gaps/tracker-gap.ts';
import { HttpError, type Deps } from '#server/http/types.ts';
import { detectTracker } from './detect.ts';
import { githubTracker } from './github/adapter.ts';
import { scratchTracker } from './scratch/adapter.ts';
import type { Tracker } from './tracker.ts';

/** Throws a 409 carrying the fatal Gap when the checkout declares no Tracker the board reads. */
export async function trackerFor(deps: Deps, repo: RepoConfig): Promise<Tracker> {
  const kind = await detectTracker(deps.fs, repo.path);
  if (kind === 'github') return githubTracker(deps.runner, repo);
  if (kind === 'scratch') return scratchTracker(deps.fs, deps.runner, repo);
  const gap = trackerGap(kind);
  throw new HttpError(409, gap.id, { gap });
}
