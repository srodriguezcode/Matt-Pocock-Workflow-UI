import { repoParam, stringParam } from '#server/http/params.ts';
import { ok, type Handler } from '#server/http/types.ts';
import { skyFor } from '#server/sky/read.ts';
import { trackerFor } from '#server/tracker/pick.ts';
import { issueId } from '#server/tracker/routes.ts';
import { readCost } from './read.ts';

/** `GET /api/cost?repo=&id=` → `CostReading`, for the open Ticket or System `id`. */
export const costRoute: Handler = async (deps, req) => {
  const repo = await repoParam(deps, req);
  const tracker = await trackerFor(deps, repo);
  const id = issueId(tracker, stringParam(req, 'id'));
  const { sky } = await skyFor(deps, repo, tracker);
  return ok(await readCost(deps, repo, tracker, sky, id));
};
