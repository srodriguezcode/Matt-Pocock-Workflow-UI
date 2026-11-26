import type { ClosedRoute } from '@contract/api';
import type { RawIssue, Tracker } from '#server/tracker/tracker.ts';
import { closedGate } from './edges.ts';
import { issueRef } from './shape.ts';

export async function readClosedRoute(tracker: Tracker, systemId: string): Promise<ClosedRoute> {
  return buildClosedRoute(systemId, await tracker.children(systemId));
}

/** A closed child still holding an open one is drawn as a closed System, so it leaves the route. */
function buildClosedRoute(systemId: string, children: RawIssue[]): ClosedRoute {
  const closed = children.filter(
    (child) => child.state === 'closed' && child.children.closed >= child.children.total,
  );
  const closedIds = new Set(closed.map((child) => child.id));
  return {
    systemId,
    children: closed.map((child) => ({ ...issueRef(child), gate: closedGate(child) })),
    lanes: children.flatMap((child) =>
      child.blockedByIds
        .filter((id) => closedIds.has(id))
        .map((blocker) => ({
          id: `${blocker}->${child.id}`,
          blocker,
          blocked: child.id,
          kind: 'lane' as const,
          systemToSystem: false,
          satisfied: true,
          hot: false,
        })),
    ),
  };
}
