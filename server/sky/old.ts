import type { Ticket } from '@contract/sky';
import { OLD_DAYS } from './claim.ts';
import type { SystemDraft } from './frontier.ts';

export function isOldTicket(gate: Ticket['gate'], age: number | null): boolean {
  return gate === 'clear' && age !== null && age >= OLD_DAYS;
}

export function markOldSystems(systems: SystemDraft[], tickets: Ticket[]): SystemDraft[] {
  const byId = new Map(systems.map((system) => [system.id, system]));
  const old = new Set<string>();
  for (const ticket of tickets) {
    if (!ticket.old) continue;
    for (let id = ticket.systemId; id !== null && !old.has(id); id = byId.get(id)!.parentId)
      old.add(id);
  }
  return systems.map((system) => ({
    ...system,
    old: old.has(system.id) || (system.kind === 'spec' && oldUnsplit(system)),
  }));
}

function oldUnsplit(system: SystemDraft): boolean {
  return system.state === 'needs-tickets' && system.age !== null && system.age >= OLD_DAYS;
}
