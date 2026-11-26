import type { SessionEvent } from '@contract/session';
import { HttpError, ok, type Handler } from '#server/http/types.ts';
import { readAnswerRequest } from './answer.ts';
import { HOOK_STARTED_HEADER, TARGET_HEADER } from './constants.ts';
import { readHookEvent } from './hook-event.ts';
import type { SessionHub } from './hub.ts';

/** What `POST /api/session/rewake` answers the rewake hook: the framed text to wake on, or `null`. */
export interface RewakeReply {
  reply: string | null;
}

/** `POST /api/session/hook`: every HTTP hook. The reply body is the hook's output. */
export const hookRoute: Handler = async (deps, req) => {
  const event = readHookEvent(req.body);
  if (!event) return ok({});
  return ok(await deps.sessions.hook(req.headers[TARGET_HEADER], event, req.signal));
};

/** `POST /api/session/rewake` a `Stop` hook input → `RewakeReply`, held until answered. */
export const rewakeRoute: Handler = async (deps, req) => {
  const event = readHookEvent(req.body);
  const reply: RewakeReply = { reply: null };
  if (event?.hook_event_name !== 'Stop') return ok(reply);
  const started = Number(req.headers[HOOK_STARTED_HEADER]);
  reply.reply = await deps.sessions.rewake(
    req.headers[TARGET_HEADER],
    event,
    req.signal,
    Number.isFinite(started) && started > 0 ? started : null,
  );
  return ok(reply);
};

/** `GET /api/sessions` → `SessionView[]`. */
export const sessionsRoute: Handler = async (deps) => ok(deps.sessions.snapshot());

/** `GET /api/session/events`: SSE of `SessionEvent`, a snapshot first. */
export const sessionEventsRoute: Handler = async (deps, req) => ({
  status: 200,
  events: sessionEvents(deps.sessions, req.signal),
});

/** `POST /api/session/answer` `AnswerRequest` → `AnswerResponse`. */
export const answerRoute: Handler = async (deps, req) => {
  const request = readAnswerRequest(req.body);
  if (!request) throw new HttpError(400, 'a well-formed AnswerRequest is required');
  const result = await deps.sessions.answer(request);
  if (result.code === 'sent' || result.code === 'gone') return ok(result);
  const raw = result.code === 'type-failed' ? result.stderr : result.code;
  throw new HttpError(502, raw || 'typing into the terminal failed', { reason: result });
};

async function* sessionEvents(hub: SessionHub, signal: AbortSignal): AsyncGenerator<SessionEvent> {
  const queue: SessionEvent[] = [];
  let wake: (() => void) | null = null;
  const unsubscribe = hub.subscribe((event) => {
    queue.push(event);
    wake?.();
  });
  const onAbort = () => wake?.();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    yield { type: 'snapshot', sessions: hub.snapshot() };
    while (!signal.aborted) {
      const next = queue.shift();
      if (next) {
        yield next;
        continue;
      }
      await new Promise<void>((resolve) => (wake = resolve));
      wake = null;
    }
  } finally {
    unsubscribe();
    signal.removeEventListener('abort', onAbort);
  }
}
