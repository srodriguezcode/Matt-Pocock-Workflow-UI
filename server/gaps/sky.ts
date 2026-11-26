import type { RepoConfig } from '@contract/repo';
import type { Sky } from '@contract/sky';
import type { Deps } from '#server/http/types.ts';
import { skyFor } from '#server/sky/read.ts';
import { trackerFor } from '#server/tracker/pick.ts';

/** A failed read already shows on the sky itself, so a Gap check skips it quietly. */
export async function tryReadSky(deps: Deps, repo: RepoConfig): Promise<Sky | null> {
  try {
    return (await skyFor(deps, repo, await trackerFor(deps, repo))).sky;
  } catch {
    return null;
  }
}
