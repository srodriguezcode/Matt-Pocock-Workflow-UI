import type { LaunchTarget, StartLabel, StartOption, StartReason } from '@contract/launch';
import type { LabelRemaps } from '@contract/repo';
import type { IssueRef, Sky, System, Ticket } from '@contract/sky';
import { UNDECIDED } from './labels.ts';

export type SystemDraft = Omit<System, 'frontierSystem' | 'splitFrontier'>;
type SkyDraft = Omit<Sky, 'systems'> & { systems: SystemDraft[] };

export interface BuiltSky {
  sky: Sky;
  /** One per open System and ticket. */
  starts: Record<string, StartOption>;
}

interface Scope {
  sky: SkyDraft;
  remaps: LabelRemaps;
  handles: Map<string, string>;
}

interface Inside {
  system: SystemDraft;
  tickets: Ticket[];
}

type Check<T> = (star: T, scope: Scope) => StartReason | null;

const TICKET_CHECKS: Check<Ticket>[] = [
  (t) =>
    t.gate === 'in-flight'
      ? { code: 'in-flight', holder: t.claim?.holder ?? null, mine: t.claim?.mine ?? false }
      : null,
  (t, { remaps }) =>
    t.readiness === 'undecided' ? { code: 'undecided', label: undecidedLabel(remaps, t) } : null,
  (t, scope) => (t.gate === 'blocked' ? blockedReason(t, scope) : null),
  (t) => (t.light === 'yours' ? { code: 'ready-for-human' } : null),
  (t) => (t.light === 'idle' ? { code: 'no-readiness' } : null),
  (t, { sky }) => (t.kind === 'decision' && sky.mapId === null ? { code: 'no-map' } : null),
  (t, { sky }) => (t.kind === 'decision' && t.systemId !== sky.mapId ? { code: 'off-map' } : null),
];

const MAP_CHECKS: Check<Inside>[] = [
  ({ tickets }) =>
    tickets.some((t) => t.light === 'decision-frontier') ? null : { code: 'no-decision-frontier' },
];

const SPLIT_CHECKS: Check<Inside>[] = [
  ({ system }, { remaps }) =>
    undecidedName(remaps, system) !== null
      ? { code: 'undecided', label: undecidedName(remaps, system) }
      : null,
];

const SYSTEM_CHECKS: Check<Inside>[] = [
  ({ system }) => (system.state === 'needs-tickets' ? { code: 'no-tickets' } : null),
  ({ system }) => (system.state === 'spent' ? { code: 'spent' } : null),
  ({ system }, { handles }) =>
    system.gated ? { code: 'system-gated', blockers: refs(handles, system.openBlockers) } : null,
  ({ system }, { sky }) => {
    const child = sky.systems.find((s) => s.parentId === system.id && !s.closed);
    return child ? { code: 'child-system', handle: child.handle } : null;
  },
  firstTicket(
    (t) => t.gate === 'in-flight',
    (t) => ({ code: 'ticket-in-flight', handle: t.handle }),
  ),
  firstTicket(
    (t) => t.kind === 'decision',
    (t) => ({ code: 'ticket-decision', handle: t.handle }),
  ),
  firstTicket(
    (t) => t.readiness === 'undecided',
    (t) => ({ code: 'ticket-undecided', handle: t.handle }),
  ),
  firstTicket(
    (t) => t.readiness === 'ready-for-human',
    (t) => ({ code: 'ticket-ready-for-human', handle: t.handle }),
  ),
  firstTicket(
    (t) => t.readiness === 'none',
    (t) => ({ code: 'ticket-no-readiness', handle: t.handle }),
  ),
  (inside, { handles }) => {
    const hit = inside.tickets.find((t) => outsideOf(inside, handles, t).length > 0);
    if (!hit) return null;
    const blockers = outsideOf(inside, handles, hit);
    return { code: 'blocked-from-outside', handle: hit.handle, blockers };
  },
  ({ tickets }) =>
    tickets.some((t) => t.gatedBy.length > 0) ? { code: 'not-frontier-system' } : null,
  ({ system, tickets }) =>
    system.childIds.length > tickets.length ? { code: 'not-frontier-system' } : null,
];

export function frontier(draft: SkyDraft, remaps: LabelRemaps): BuiltSky {
  const scope: Scope = { sky: draft, remaps, handles: handleIndex(draft) };
  const starts: Record<string, StartOption> = {};
  for (const ticket of draft.tickets) {
    const decision = ticket.kind === 'decision';
    const target = { kind: decision ? 'decision' : 'ticket', id: ticket.id } as const;
    starts[ticket.id] = option(TICKET_CHECKS, ticket, scope, target, {
      code: decision ? 'decision' : 'ticket',
    });
  }
  const systems = draft.systems.map((system): System => {
    if (system.closed) return decided(system, false, false);
    const inside = { system, tickets: ticketsOf(draft, system) };
    if (isSplit(system)) {
      const start = option(
        SPLIT_CHECKS,
        inside,
        scope,
        { kind: 'split', id: system.id },
        { code: 'split' },
      );
      starts[system.id] = start;
      return decided(system, false, start.enabled);
    }
    const start =
      system.kind === 'map'
        ? option(MAP_CHECKS, inside, scope, { kind: 'map', id: system.id }, { code: 'map' })
        : option(
            SYSTEM_CHECKS,
            inside,
            scope,
            { kind: 'system', id: system.id },
            { code: 'system', count: inside.tickets.length },
          );
    starts[system.id] = start;
    return decided(system, system.kind !== 'map' && start.enabled, false);
  });
  return { sky: { ...draft, systems }, starts };
}

function decided(system: SystemDraft, frontierSystem: boolean, splitFrontier: boolean): System {
  const { childIds, arc, base, age, old, flagged, flaggedTickets, ...head } = system;
  return {
    ...head,
    frontierSystem,
    splitFrontier,
    childIds,
    arc,
    base,
    age,
    old,
    flagged,
    flaggedTickets,
  };
}

export function ticketsOf(sky: Pick<Sky, 'tickets'>, system: Pick<System, 'id'>): Ticket[] {
  return sky.tickets.filter((t) => t.systemId === system.id);
}

function option<T>(
  checks: Check<T>[],
  star: T,
  scope: Scope,
  target: LaunchTarget,
  label: StartLabel,
): StartOption {
  for (const check of checks) {
    const reason = check(star, scope);
    if (reason) return { enabled: false, target, reason };
  }
  return { enabled: true, target, label };
}

function firstTicket(test: (t: Ticket) => boolean, why: (t: Ticket) => StartReason): Check<Inside> {
  return ({ tickets }) => {
    const hit = tickets.find(test);
    return hit ? why(hit) : null;
  };
}

function blockedReason(ticket: Ticket, { sky, handles }: Scope): StartReason {
  const own = {
    code: 'blocked-by',
    blockers: refs(handles, ticket.openBlockers),
    outside: ticket.outsideBlockers,
  } as const;
  if (own.blockers.length || own.outside.length) return own;
  const gated = sky.systems.find((s) => s.id === ticket.gatedBy[0]);
  if (!gated) return own;
  return { code: 'gated', blockers: refs(handles, gated.openBlockers), system: gated.name };
}

function outsideOf({ tickets }: Inside, handles: Map<string, string>, ticket: Ticket): string[] {
  const inside = new Set(tickets.map((t) => t.id));
  return [
    ...ticket.openBlockers.filter((id) => !inside.has(id)).map((id) => handleOf(handles, id)),
    ...ticket.outsideBlockers,
  ];
}

function undecidedLabel(remaps: LabelRemaps, ticket: Ticket): string | null {
  return undecidedName(remaps, ticket);
}

function undecidedName(remaps: LabelRemaps, star: Pick<IssueRef, 'labels'>): string | null {
  const names = UNDECIDED.map((name) => remaps[name] ?? name);
  return star.labels.find((l) => names.includes(l.name))?.name ?? null;
}

function isSplit(system: SystemDraft): boolean {
  return system.kind === 'spec' && system.state === 'needs-tickets';
}

function handleIndex(sky: SkyDraft): Map<string, string> {
  const stars: IssueRef[] = [...sky.systems, ...sky.tickets, ...sky.embers];
  return new Map(stars.map((s) => [s.id, s.handle]));
}

function handleOf(handles: Map<string, string>, id: string): string {
  return handles.get(id) ?? `#${id}`;
}

function refs(handles: Map<string, string>, ids: string[]): string[] {
  return ids.map((id) => handleOf(handles, id));
}
