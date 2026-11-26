import type { ClosedRoute } from '@contract/api';
import type { ClosedChild, Ember, IssueRef, Sky, System, Ticket } from '@contract/sky';
import { LOOSE } from './types';

export type Star =
  | { kind: 'ticket'; ticket: Ticket }
  | { kind: 'system'; system: System }
  | { kind: 'ember'; ember: Ember }
  | { kind: 'closed'; child: ClosedChild; system: System };

interface IndexedStar {
  star: Star;
  ref: IssueRef;
  /** The System whose disc it sits in. `null` for a Loose ticket and for an Ember. */
  home: string | null;
  /** Filter keys it hides under. It stays shown while any one isn't hidden, and an empty list never hides. */
  keys: string[];
}

/** The Sky as the board draws it: the polled Sky plus the closed route read for one System. */
export interface RoutedSky extends Sky {
  route?: ClosedRoute;
  index: ReadonlyMap<string, IndexedStar>;
}

/**
 * Folds the route's Lanes into `dependencies` and indexes every star. A child the Sky already
 * draws, or one that reopened since the route was read, stays as the Sky has it.
 */
export function withRoute(sky: Sky, route: ClosedRoute | null): RoutedSky {
  const home = sky.systems.find((s) => s.id === route?.systemId);
  if (!route || !home || home.closed)
    return { ...sky, route: undefined, index: indexOf(sky, null) };
  const onSky = new Set([...sky.systems, ...sky.tickets].map((i) => i.id));
  const children = route.children.filter((c) => !onSky.has(c.id));
  const ends = new Set([...onSky, ...children.map((c) => c.id), ...sky.embers.map((e) => e.id)]);
  const known = new Set(sky.dependencies.map((d) => d.id));
  const lanes = route.lanes.filter(
    (d) => !known.has(d.id) && ends.has(d.blocker) && ends.has(d.blocked),
  );
  return {
    ...sky,
    dependencies: [...sky.dependencies, ...lanes],
    route: { ...route, children },
    index: indexOf(sky, { system: home, children }),
  };
}

function indexOf(
  sky: Sky,
  closed: { system: System; children: ClosedChild[] } | null,
): Map<string, IndexedStar> {
  const index = new Map<string, IndexedStar>();
  for (const system of sky.systems) {
    const star: Star = { kind: 'system', system };
    index.set(system.id, { star, ref: system, home: system.id, keys: [system.id] });
  }
  for (const ticket of sky.tickets) {
    const home = ticket.systemId !== null && index.has(ticket.systemId) ? ticket.systemId : null;
    const star: Star = { kind: 'ticket', ticket };
    index.set(ticket.id, { star, ref: ticket, home, keys: [home ?? LOOSE] });
  }
  if (closed) {
    const { system, children } = closed;
    for (const child of children) {
      const star: Star = { kind: 'closed', child, system };
      index.set(child.id, { star, ref: child, home: system.id, keys: [system.id] });
    }
  }
  for (const ember of sky.embers) {
    const keys = ember.blocks.flatMap((id) => index.get(id)?.keys ?? []);
    index.set(ember.id, { star: { kind: 'ember', ember }, ref: ember, home: null, keys });
  }
  return index;
}

export function handleOf(sky: RoutedSky, id: string): string | null {
  return sky.index.get(id)?.ref.handle ?? null;
}

export function isLoose(indexed: IndexedStar | undefined): boolean {
  return indexed?.star.kind === 'ticket' && indexed.home === null;
}

export function looseTickets(sky: RoutedSky): Ticket[] {
  return sky.tickets.filter((t) => isLoose(sky.index.get(t.id)));
}

export function closedChildren(sky: RoutedSky, systemId: string): ClosedChild[] {
  return sky.route?.systemId === systemId ? sky.route.children : [];
}
