import type { Readiness, Ticket, TicketKind } from '@contract/sky';
import type { RawIssue } from '#server/tracker/tracker.ts';
import { daysSince, readClaim } from './claim.ts';
import { isOldTicket } from './old.ts';
import { issueRef, type Shape } from './shape.ts';

export function isGated(shape: Shape, system: RawIssue): boolean {
  return (
    system.state === 'open' &&
    (shape.openBlockers(system).length > 0 || system.outsideBlockers.length > 0)
  );
}

export function buildTickets(shape: Shape, viewer: string | null, now: Date): Ticket[] {
  const unblocks = new Map<string, string[]>();
  const open = [...shape.tickets, ...shape.systems.filter((s) => s.state === 'open')];
  for (const blocked of open)
    for (const id of shape.openBlockers(blocked))
      unblocks.set(id, [...(unblocks.get(id) ?? []), blocked.id]);

  return shape.tickets.map((issue) => {
    const role = shape.roles.get(issue.id)!;
    const systemId = shape.systemOf(issue);
    const openBlockers = shape.openBlockers(issue);
    const gatedBy = gatedSystemsAbove(shape, systemId);
    const inFlight = issue.assignees.length > 0 || issue.claim !== null;
    const blocked = openBlockers.length + issue.outsideBlockers.length + gatedBy.length > 0;
    const gate = inFlight ? 'in-flight' : blocked ? 'blocked' : 'clear';
    const clearLight = lightAtClear(role.kind, role.readiness);
    const parent = issue.parentId === null ? null : shape.byId.get(issue.parentId);
    const age = daysSince(issue.createdAt, now);
    return {
      ...issueRef(issue),
      kind: role.kind,
      research: role.research,
      systemId,
      gate,
      readiness: role.readiness,
      readinessConflict: role.readinessConflict,
      light: gate === 'clear' ? clearLight : gate,
      clearLight,
      claim: inFlight ? readClaim(issue, viewer, now) : null,
      openBlockers,
      gatedBy,
      outsideBlockers: issue.outsideBlockers,
      unblocks: (unblocks.get(issue.id) ?? []).sort(byId),
      closedParentId: parent?.state === 'closed' && systemId !== null ? parent.id : null,
      namedParentId: issue.namedParentId,
      age,
      old: isOldTicket(gate, age),
      flagged: issue.flagged,
    };
  });
}

function gatedSystemsAbove(shape: Shape, systemId: string | null): string[] {
  const gated: string[] = [];
  const seen = new Set<string>();
  for (let id = systemId; id !== null && !seen.has(id);) {
    seen.add(id);
    const system = shape.byId.get(id)!;
    if (isGated(shape, system)) gated.push(id);
    id = shape.systemOf(system);
  }
  return gated;
}

function lightAtClear(kind: TicketKind, readiness: Readiness): Ticket['clearLight'] {
  if (readiness === 'undecided') return 'undecided';
  if (kind === 'decision') return 'decision-frontier';
  if (readiness === 'ready-for-agent') return 'frontier';
  if (readiness === 'ready-for-human') return 'yours';
  return 'idle';
}

function byId(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}
