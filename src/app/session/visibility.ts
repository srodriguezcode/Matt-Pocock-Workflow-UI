import type { SessionStatus, SessionView } from '@contract/session';
import type { Sky } from '@contract/sky';
import { placeSessions, starIdOf } from './place';

export type EndedUnder = ReadonlyMap<string, string>;

export function starFingerprint(sky: Sky, id: string | null): string | null {
  if (id === null) return null;
  const ticket = sky.tickets.find((t) => t.id === id);
  if (ticket) return `${ticket.gate}|${ticket.claim?.holder ?? ''}|${ticket.claim?.since ?? ''}`;
  const system = sky.systems.find((s) => s.id === id);
  return system ? `${system.state}|${system.closed}` : null;
}

export function recordEnded(
  known: EndedUnder,
  sessions: Iterable<SessionView>,
  sky: Sky,
  repo: string,
): EndedUnder {
  const next = new Map<string, string>();
  for (const session of sessions) {
    if (session.state !== 'ended') continue;
    const before = known.get(session.sessionId);
    if (before !== undefined) next.set(session.sessionId, before);
    else if (session.repo === repo) {
      const now = starFingerprint(sky, starIdOf(session.target));
      if (now !== null) next.set(session.sessionId, now);
    }
  }
  return next.size === known.size && [...next].every(([id, f]) => known.get(id) === f)
    ? known
    : next;
}

export function visibleSessions(
  sessions: SessionView[],
  sky: Sky,
  endedUnder: EndedUnder,
): SessionView[] {
  const starOf = new Map<string, string>();
  for (const [starId, { session, sharedFrom }] of placeSessions(sky, sessions)) {
    if (sharedFrom === null) starOf.set(session.sessionId, starId);
  }
  return sessions.filter((session) => {
    if (session.state === 'ended') {
      const under = endedUnder.get(session.sessionId);
      return under === undefined || under === starFingerprint(sky, starIdOf(session.target));
    }
    if (session.state === 'lost') {
      const starId = starOf.get(session.sessionId);
      return starId !== undefined && stillClaimed(sky, starId);
    }
    return true;
  });
}

function stillClaimed(sky: Sky, id: string): boolean {
  const ticket = sky.tickets.find((t) => t.id === id);
  if (ticket) return ticket.claim !== null;
  const system = sky.systems.find((s) => s.id === id);
  if (system) return !system.closed;
  return sky.mapId === id;
}

export function triggersReread(known: SessionView | undefined, next: SessionStatus): boolean {
  if (!endsTurn(next) && next.state !== 'ended' && next.state !== 'lost') return false;
  return known?.state !== next.state || known.since !== next.since;
}

function endsTurn(status: SessionStatus): boolean {
  if (status.state === 'waiting') return status.waiting === 'turn-end';
  return status.state === 'asking' && status.question?.kind === 'round';
}
