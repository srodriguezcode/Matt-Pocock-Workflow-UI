import type { RuntimeResponse } from '@contract/api';
import { costRoute } from '#server/cost/routes.ts';
import { gapsRoute } from '#server/gaps/routes.ts';
import { planRoute, startRoute } from '#server/launch/routes.ts';
import {
  addRepoRoute,
  branchesRoute,
  editRepoRoute,
  listReposRoute,
  removeRepoRoute,
  reorderReposRoute,
} from '#server/repos/routes.ts';
import {
  answerRoute,
  hookRoute,
  rewakeRoute,
  sessionEventsRoute,
  sessionsRoute,
} from '#server/session/routes.ts';
import { HOOK_PATH, REWAKE_PATH } from '#server/session/constants.ts';
import { saveSettingsRoute, settingsRoute } from '#server/settings/routes.ts';
import { closedRouteRoute, issueRoute, skyRoute } from '#server/sky/routes.ts';
import { flagRoute, releaseRoute } from '#server/tracker/routes.ts';
import { ok, type Handler } from './types.ts';

export const routes: Record<string, Handler> = {
  'GET /api/health': async () => ok({ ok: true }),
  'GET /api/runtime': async (deps) => ok({ runtime: deps.runtime } satisfies RuntimeResponse),
  'GET /api/repos': listReposRoute,
  'POST /api/repos': addRepoRoute,
  'PUT /api/repos': editRepoRoute,
  'DELETE /api/repos': removeRepoRoute,
  'PUT /api/repos/order': reorderReposRoute,
  'GET /api/sky': skyRoute,
  'GET /api/issue': issueRoute,
  'GET /api/route': closedRouteRoute,
  'GET /api/cost': costRoute,
  'GET /api/branches': branchesRoute,
  'POST /api/plan': planRoute,
  'POST /api/start': startRoute,
  'POST /api/release': releaseRoute,
  'POST /api/flag': flagRoute,
  'GET /api/gaps': gapsRoute,
  'GET /api/settings': settingsRoute,
  'PUT /api/settings': saveSettingsRoute,
  [`POST ${HOOK_PATH}`]: hookRoute,
  [`POST ${REWAKE_PATH}`]: rewakeRoute,
  'GET /api/sessions': sessionsRoute,
  'GET /api/session/events': sessionEventsRoute,
  'POST /api/session/answer': answerRoute,
};
