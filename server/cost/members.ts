import type { Sky } from '@contract/sky';
import type { RawIssue, Tracker } from '#server/tracker/tracker.ts';
import type { CostMember } from './session.ts';

const hasChildren = (issue: RawIssue) => issue.children.total > 0 || issue.childIds.length > 0;

export async function costMembers(tracker: Tracker, sky: Sky, id: string): Promise<CostMember[]> {
  const system = sky.systems.find((s) => s.id === id);
  const star = system ?? sky.tickets.find((t) => t.id === id);
  const self: CostMember = {
    id,
    handle: star?.handle ?? id,
    closed: system?.closed ?? false,
    closeReason: null,
    parentId: null,
    system: system !== undefined,
  };
  if (!system) return [self];

  const seen = new Set([id]);
  const descend = async (systemId: string): Promise<CostMember[]> => {
    const children = (await tracker.children(systemId)).filter(
      (child) => !seen.has(child.id) && seen.add(child.id),
    );
    const subtrees = await Promise.all(
      children.map((child) => (hasChildren(child) ? descend(child.id) : [])),
    );
    return children.flatMap((child, i) => [
      {
        id: child.id,
        handle: child.handle,
        closed: child.state === 'closed',
        closeReason: child.closeReason,
        parentId: systemId,
        system: hasChildren(child),
      },
      ...(subtrees[i] ?? []),
    ]);
  };
  return [self, ...(await descend(id))];
}
