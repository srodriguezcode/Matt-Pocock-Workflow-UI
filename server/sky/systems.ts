import type { SystemKind, SystemState } from '@contract/sky';
import type { SystemDraft } from './frontier.ts';
import { daysSince } from './claim.ts';
import { issueRef, type Shape } from './shape.ts';
import { isGated } from './tickets.ts';

export function buildSystems(shape: Shape, now: Date): SystemDraft[] {
  return shape.systems.map((issue) => {
    const role = shape.roles.get(issue.id)!;
    const kind: SystemKind = issue.systemHint ?? (role.map ? 'map' : role.spec ? 'spec' : 'plain');
    const children = shape.children(issue.id);
    const state: SystemState = children.length
      ? 'live'
      : issue.children.total === 0
        ? 'needs-tickets'
        : 'spent';
    return {
      ...issueRef(issue),
      name: systemName(issue.title),
      kind,
      parentId: shape.systemOf(issue),
      state,
      closed: issue.state === 'closed',
      gated: isGated(shape, issue),
      openBlockers: shape.openBlockers(issue),
      childIds: children.map((child) => child.id),
      arc: { closed: issue.children.closed, total: issue.children.total },
      base: issue.base,
      age: daysSince(issue.createdAt, now),
      old: false,
      flagged: issue.flagged,
      flaggedTickets: 0,
    };
  });
}

export function systemName(title: string): string {
  const cut = title
    .replace(/^(Spec|Map|Prototype):\s*/i, '')
    .split(/\s+—\s+|:\s/)[0]!
    .trim();
  const name = cut || title.trim();
  return name.length > 30 ? `${name.slice(0, 29)}…` : name;
}
