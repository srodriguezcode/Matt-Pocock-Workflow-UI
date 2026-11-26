import type { SkyResponse } from '@contract/api';
import type { RepoConfig } from '@contract/repo';
import type { Deps } from '#server/http/types.ts';
import { trackerFor } from '#server/tracker/pick.ts';
import type { Tracker } from '#server/tracker/tracker.ts';
import type { BuiltSky } from './frontier.ts';
import { buildSky } from './model.ts';

const CACHE_TTL_MS = 2 * 60 * 1000;

const inFlight = new Map<string, Promise<SkyResponse>>();
const cached = new Map<string, { response: SkyResponse; expiresAt: number }>();

/**
 * `fresh: true` always reads and replaces the cached entry. A non-fresh call
 * within `CACHE_TTL_MS` of the last successful read is served from it instead.
 */
export function readSky(
  deps: Deps,
  repo: RepoConfig,
  options: { fresh?: boolean } = {},
): Promise<SkyResponse> {
  if (!options.fresh) {
    const running = inFlight.get(repo.path);
    if (running) return running;
    const entry = cached.get(repo.path);
    if (entry && deps.now().getTime() < entry.expiresAt) return Promise.resolve(entry.response);
  }
  const read: Promise<SkyResponse> = (async () => {
    const raw = await (await trackerFor(deps, repo)).read();
    const response = {
      ...buildSky(raw, repo.labels, deps.now()),
      readAt: deps.now().toISOString(),
    };
    cached.set(repo.path, { response, expiresAt: deps.now().getTime() + CACHE_TTL_MS });
    return response;
  })().finally(() => {
    if (inFlight.get(repo.path) === read) inFlight.delete(repo.path);
  });
  inFlight.set(repo.path, read);
  return read;
}

/** A `.scratch/` read costs no API call, so it skips the cache and is always fresh. */
export async function skyFor(
  deps: Deps,
  repo: RepoConfig,
  tracker: Tracker,
  options: { fresh?: boolean } = {},
): Promise<BuiltSky> {
  if (tracker.kind === 'scratch') return buildSky(await tracker.read(), repo.labels, deps.now());
  const { sky, starts } = await readSky(deps, repo, options);
  return { sky, starts };
}
