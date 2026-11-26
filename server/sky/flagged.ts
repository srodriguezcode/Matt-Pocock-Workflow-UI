import type { Ticket } from '@contract/sky';
import type { SystemDraft } from './frontier.ts';

export function countFlaggedTickets(systems: SystemDraft[], tickets: Ticket[]): SystemDraft[] {
  const counts = new Map<string, number>();
  for (const ticket of tickets)
    if (ticket.flagged && ticket.systemId !== null)
      counts.set(ticket.systemId, (counts.get(ticket.systemId) ?? 0) + 1);
  return systems.map((system) => ({
    ...system,
    flaggedTickets: system.kind === 'map' ? 0 : (counts.get(system.id) ?? 0),
  }));
}
