import type { SkyResponse } from '@contract/api';
import { repoParam, stringParam } from '#server/http/params.ts';
import { ok, type Handler } from '#server/http/types.ts';
import { trackerFor } from '#server/tracker/pick.ts';
import { issueId } from '#server/tracker/routes.ts';
import { readClosedRoute } from './closed-route.ts';
import { readSky } from './read.ts';
import { boardStarts } from './starts.ts';

/** `GET /api/sky?repo=[&fresh=1]` → `SkyResponse`. Concurrent reads share one Tracker read. `fresh=1` never joins one. */
export const skyRoute: Handler = async (deps, req) => {
  const repo = await repoParam(deps, req);
  const read = await readSky(deps, repo, { fresh: req.query.get('fresh') === '1' });
  const live = deps.sessions.liveTargets();
  const scope = { live, repo: repo.path };
  const response: SkyResponse = { ...read, starts: boardStarts(read.starts, scope) };
  return ok(response);
};

/** `GET /api/issue?repo=&id=` → `IssueDetail`. */
export const issueRoute: Handler = async (deps, req) => {
  const repo = await repoParam(deps, req);
  const tracker = await trackerFor(deps, repo);
  return ok(await tracker.detail(issueId(tracker, stringParam(req, 'id'))));
};

/** `GET /api/route?repo=&id=` → `ClosedRoute`, for the open System `id`. */
export const closedRouteRoute: Handler = async (deps, req) => {
  const repo = await repoParam(deps, req);
  const tracker = await trackerFor(deps, repo);
  const id = issueId(tracker, stringParam(req, 'id'));
  return ok(await readClosedRoute(tracker, id));
};
