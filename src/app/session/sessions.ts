import type { SessionEvent, SessionView } from '@contract/session';
import { PEEK_LINES } from './limits';

export type Sessions = ReadonlyMap<string, SessionView>;

/** The Sessions after one SSE event. A `peek` for a Session not yet known is dropped. */
export function applyEvent(sessions: Sessions, event: SessionEvent): Sessions {
  if (event.type === 'snapshot') return new Map(event.sessions.map((s) => [s.sessionId, s]));
  const next = new Map(sessions);
  if (event.type === 'drop') {
    next.delete(event.sessionId);
    return next;
  }
  if (event.type === 'status') {
    const known = sessions.get(event.session.sessionId);
    next.set(event.session.sessionId, { ...event.session, peek: known?.peek ?? [] });
    return next;
  }
  const known = sessions.get(event.sessionId);
  if (!known) return sessions;
  next.set(event.sessionId, { ...known, peek: [...known.peek, event.line].slice(-PEEK_LINES) });
  return next;
}
