import type { GapsResponse } from '@contract/api';
import { repoParam } from '#server/http/params.ts';
import { ok, type Handler } from '#server/http/types.ts';
import { checkMachine } from './machine.ts';
import { checkRepo } from './repo.ts';
import { BOARD_CHECKOUT, sessionSkills } from './skills.ts';

/** `GET /api/gaps[?repo=]` → `GapsResponse`: machine Gaps, plus the repo's when one is named. */
export const gapsRoute: Handler = async (deps, req) => {
  const gaps = await checkMachine(deps.runner, deps.fs, deps.home, deps.runtime);
  const reply: GapsResponse = { gaps, sessionSkills: [] };
  if (req.query.get('repo')) {
    const repo = await repoParam(deps, req);
    gaps.push(...(await checkRepo(deps, repo, BOARD_CHECKOUT)));
    reply.sessionSkills = await sessionSkills(deps.fs, repo, deps.home, deps.claudeConfigDir);
  }
  return ok(reply);
};
