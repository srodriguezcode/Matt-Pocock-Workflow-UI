import type { LinkedTarget } from '@contract/launch';
import type { SessionView } from '@contract/session';
import type { Sky, Ticket } from '@contract/sky';

export interface Placed {
  session: SessionView;
  /** On a child ticket of a Frontier system Start: the System that carries the state and the mark. */
  sharedFrom: string | null;
}

/** `null` for a new session, which shows on no star. */
export const starIdOf = (target: LinkedTarget): string | null =>
  target.kind === 'session' ? null : target.id;

/** Each Session keyed by the star it shows on. `sessions` are the active repo's. */
export function placeSessions(sky: Sky, sessions: SessionView[]): Map<string, Placed> {
  const placed = new Map<string, Placed>();
  const onMap: SessionView[] = [];
  const systems = new Set(sky.systems.map((s) => s.id));
  const tickets = new Set(sky.tickets.map((t) => t.id));
  for (const session of sessions) {
    const { target } = session;
    if (target.kind === 'session') continue;
    const { kind, id } = target;
    if (kind === 'map') {
      if (sky.mapId === id) onMap.push(session);
    } else if (kind === 'system') {
      if (systems.has(id)) shareOnSystem(sky, session, placed);
    } else if (kind === 'split') {
      if (systems.has(id)) placed.set(id, { session, sharedFrom: null });
    } else if (tickets.has(id)) {
      placed.set(id, { session, sharedFrom: null });
    }
  }
  const byStart = onMap.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  for (const session of byStart) {
    const claimed = sky.tickets.filter((t) => claimedSince(t, session) && !placed.has(t.id));
    const to = claimed.length === 1 ? claimed[0]!.id : starIdOf(session.target)!;
    placed.set(to, { session, sharedFrom: null });
  }
  return placed;
}

function shareOnSystem(sky: Sky, session: SessionView, placed: Map<string, Placed>): void {
  const systemId = starIdOf(session.target)!;
  placed.set(systemId, { session, sharedFrom: null });
  for (const ticket of sky.tickets) {
    if (ticket.systemId === systemId && ticket.claim?.mine) {
      placed.set(ticket.id, { session, sharedFrom: systemId });
    }
  }
}

function claimedSince(ticket: Ticket, session: SessionView): boolean {
  const { claim } = ticket;
  return (
    ticket.kind === 'decision' &&
    !!claim?.mine &&
    claim.since !== null &&
    Date.parse(claim.since) >= Date.parse(session.startedAt)
  );
}
