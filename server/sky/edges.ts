import type { Dependency, Ember, Ticket } from '@contract/sky';
import type { RawIssue } from '#server/tracker/tracker.ts';
import { issueRef, type Shape } from './shape.ts';

export function buildDependencies(shape: Shape, tickets: Ticket[]): Dependency[] {
  const gates = new Map(tickets.map((ticket) => [ticket.id, ticket.gate]));
  const blocked = [...shape.systems, ...shape.tickets].filter((i) => i.state === 'open');
  return blocked.flatMap((issue) =>
    issue.blockedByIds
      .filter((id) => shape.isDrawn(id))
      .map((blockerId) => {
        const blocker = shape.byId.get(blockerId)!;
        const bothTickets = !shape.isSystem(blockerId) && !shape.isSystem(issue.id);
        const systemId = shape.systemOf(issue);
        const lane = bothTickets && systemId !== null && shape.systemOf(blocker) === systemId;
        const gate = gates.get(blockerId);
        return {
          id: `${blockerId}->${issue.id}`,
          blocker: blockerId,
          blocked: issue.id,
          kind: lane ? 'lane' : 'hyperlane',
          systemToSystem: shape.isSystem(blockerId) && shape.isSystem(issue.id),
          satisfied: blocker.state === 'closed',
          hot: gate === 'clear' || gate === 'in-flight',
        };
      }),
  );
}

export function buildEmbers(shape: Shape): Ember[] {
  const open = [...shape.systems, ...shape.tickets].filter((i) => i.state === 'open');
  return shape.embers.map((issue) => ({
    ...issueRef(issue),
    gate: closedGate(issue),
    blocks: open.filter((i) => i.blockedByIds.includes(issue.id)).map((i) => i.id),
  }));
}

export function closedGate(issue: RawIssue): 'done' | 'ruled-out' {
  return issue.closeReason === 'not-planned' || issue.closeReason === 'duplicate'
    ? 'ruled-out'
    : 'done';
}
