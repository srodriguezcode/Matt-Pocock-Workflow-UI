import type { GapsResponse } from '@contract/api';
import { repoParam } from '#server/http/params.ts';
import { ok, type Handler } from '#server/http/types.ts';
import { checkMachine } from './machine.ts';
import { checkRepo } from './repo.ts';
import { BOARD_CHECKOUT } from './skills.ts';

/** `GET /api/gaps[?repo=]` → `GapsResponse`: machine Gaps, plus the repo's when one is named. */
export const gapsRoute: Handler = async (deps, req) => {
  const gaps = await checkMachine(deps.runner, deps.fs, deps.home, deps.runtime);
  if (req.query.get('repo')) {
    const repo = await repoParam(deps, req);
    gaps.push(...(await checkRepo(deps, repo, BOARD_CHECKOUT)));
  }
  const reply: GapsResponse = { gaps };
  return ok(reply);
};
