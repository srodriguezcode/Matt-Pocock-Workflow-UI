import { join } from 'node:path';
import type { PlanRequest } from '@contract/api';
import type { LaunchEvent, LaunchTarget, PlanRefusal, StarKind } from '@contract/launch';
import { repoParam } from '#server/http/params.ts';
import { HttpError, ok, type ApiRequest, type Deps, type Handler } from '#server/http/types.ts';
import { executeStart } from './execute.ts';
import { prepareStart, startBlock } from './prepare.ts';
import { pruneWorktrees } from './prune.ts';
import { trustWorktree } from './trust.ts';

const STAR_KINDS: StarKind[] = ['ticket', 'system', 'decision', 'map', 'split'];

/** `POST /api/plan` `PlanRequest` → `PlanResult`. */
export const planRoute: Handler = async (deps, req) => {
  const { target, base } = parse(req);
  const repo = await repoParam(deps, req);
  return ok((await prepareStart(deps, repo, target, base)).result);
};

/** `POST /api/start` `StartRequest` → a stream of `LaunchEvent`. */
export const startRoute: Handler = async (deps, req) => {
  const { target, base } = parse(req);
  const repo = await repoParam(deps, req);
  const blocked = await startBlock(deps, repo, target);
  if (blocked !== null) return refuse({ code: 'gap', problem: blocked });
  const { result, tracker, sky } = await prepareStart(deps, repo, target, base, {
    fresh: true,
  });
  if (!result.ok) return refuse(result.reason);
  const live = deps.sessions
    .liveTargets()
    .filter((l) => l.repo === repo.path)
    .map((l) => l.target);
  const trusts = deps.runtime === 'container';
  const stream = executeStart(result.plan, {
    runner: deps.runner,
    tracker,
    checkout: repo.path,
    sessions: deps.sessions,
    beforeOpen: async (cwd) => {
      if (trusts) await trustWorktree(deps.fs, claudeJson(deps), cwd);
    },
    prune: () => pruneWorktrees({ runner: deps.runner, tracker, repo, sky, live }),
  });
  return { status: 200, stream };
};

/** Where Claude keeps its per-project trust: inside `CLAUDE_CONFIG_DIR` when set, else `~/.claude.json`. */
function claudeJson(deps: Deps): string {
  return deps.claudeConfigDir === null
    ? join(deps.home, '.claude.json')
    : join(deps.claudeConfigDir, '.claude.json');
}

function parse(req: ApiRequest): { target: LaunchTarget; base: string | null } {
  const body = req.body as Partial<PlanRequest> | null;
  const target = body?.target;
  const star = target && 'id' in target && typeof target.id === 'string';
  if (!target || !(target.kind === 'architecture' || (star && STAR_KINDS.includes(target.kind)))) {
    throw new HttpError(400, 'target is required');
  }
  const base = typeof body.base === 'string' && body.base ? body.base : null;
  return {
    target: target.kind === 'architecture' ? { kind: 'architecture' } : target,
    base,
  };
}

function refuse(reason: PlanRefusal) {
  const end: LaunchEvent = { type: 'end', ok: false, outcome: { code: 'refused', reason } };
  return {
    status: 200,
    stream: (async function* () {
      yield end;
    })(),
  };
}
