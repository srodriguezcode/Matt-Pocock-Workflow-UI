import type { PlanRequest } from '@contract/api';
import type { LaunchTarget, SessionTarget, StarKind } from '@contract/launch';
import { SESSION_SKILLS } from '#server/gaps/skills.ts';
import { HttpError } from '#server/http/types.ts';

export const STAR_KINDS: StarKind[] = ['ticket', 'system', 'decision', 'map', 'split'];
const MAX_KEY = 40;
/** Characters. A first message longer than this belongs in a file the session reads. */
export const MAX_PROMPT = 20_000;

/** The body of `/api/plan` and `/api/start`. A bad one throws a 400. */
export function parsePlanRequest(body: unknown): { target: LaunchTarget; base: string | null } {
  const request = body as Partial<PlanRequest> | null;
  const target = request?.target;
  if (target?.kind === 'architecture') return { target: { kind: 'architecture' }, base: null };
  if (target?.kind === 'session') return { target: sessionTarget(target), base: null };
  const star = target && 'id' in target && typeof target.id === 'string';
  if (!target || !star || !STAR_KINDS.includes(target.kind)) {
    throw new HttpError(400, 'target is required');
  }
  const base = typeof request.base === 'string' && request.base ? request.base : null;
  return { target, base };
}

function sessionTarget(raw: Partial<SessionTarget>): SessionTarget {
  const { key, prompt, skill } = raw;
  if (typeof key !== 'string' || !key || key.length > MAX_KEY) {
    throw new HttpError(400, 'target.key is required');
  }
  if (prompt !== undefined && (typeof prompt !== 'string' || prompt.length > MAX_PROMPT)) {
    throw new HttpError(400, `target.prompt must be text of at most ${MAX_PROMPT} characters`);
  }
  if (skill !== undefined && !SESSION_SKILLS.includes(skill)) {
    throw new HttpError(400, 'target.skill is not a new-session skill');
  }
  return { kind: 'session', key, ...(prompt ? { prompt } : {}), ...(skill ? { skill } : {}) };
}
