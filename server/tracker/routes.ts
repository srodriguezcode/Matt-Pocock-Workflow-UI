import type { FlagRequest, ReleaseRequest, ReleaseResponse } from '@contract/api';
import { repoParam } from '#server/http/params.ts';
import { HttpError, ok, type Handler, type Reply } from '#server/http/types.ts';
import { trackerFor } from './pick.ts';
import { ReleaseRefused, type Tracker } from './tracker.ts';

export function issueId(tracker: Tracker, id: unknown): string {
  if (typeof id !== 'string' || !tracker.isId(id)) throw new HttpError(400, `bad issue id: ${id}`);
  return id;
}

/** `POST /api/release` `ReleaseRequest` → `ReleaseResponse`. Unassigns only. Worktrees stay. */
export const releaseRoute: Handler = async (deps, req) => {
  const repo = await repoParam(deps, req);
  const ids = (req.body as Partial<ReleaseRequest> | null)?.ids;
  if (!Array.isArray(ids)) throw new HttpError(400, 'ids is required');
  const tracker = await trackerFor(deps, repo);
  const reply: ReleaseResponse = { released: [], failed: [] };
  for (const id of ids.map((id) => issueId(tracker, id))) {
    try {
      await tracker.release(id);
      reply.released.push(id);
    } catch (error) {
      const reason = error instanceof ReleaseRefused ? { reason: error.reason } : {};
      reply.failed.push({ id, error: (error as Error).message, ...reason });
    }
  }
  return ok(reply);
};

/** `POST /api/flag` `FlagRequest` → empty body, or `flag-failed` (ADR 0003). */
export const flagRoute: Handler = async (deps, req) => {
  const repo = await repoParam(deps, req);
  const flagged = (req.body as Partial<FlagRequest> | null)?.flagged;
  if (typeof flagged !== 'boolean') throw new HttpError(400, 'flagged is required');
  const tracker = await trackerFor(deps, repo);
  const id = issueId(tracker, (req.body as Partial<FlagRequest>).id);
  return flagIssue(tracker, id, flagged);
};

export async function flagIssue(tracker: Tracker, id: string, flagged: boolean): Promise<Reply> {
  try {
    await tracker.flag(id, flagged);
  } catch (error) {
    throw new HttpError(502, (error as Error).message, { reason: { code: 'flag-failed' } });
  } finally {
    /** After the write, which is when `.scratch/` knows the real file behind a glob. */
    console.log(tracker.flagCommand(id, flagged));
  }
  return ok({});
}
