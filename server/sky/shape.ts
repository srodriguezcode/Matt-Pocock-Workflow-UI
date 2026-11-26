import type { LabelRemaps } from '@contract/repo';
import type { IssueRef } from '@contract/sky';
import type { RawGraph, RawIssue } from '#server/tracker/tracker.ts';
import { labelRoles, type Roles } from './labels.ts';

export interface Shape {
  byId: Map<string, RawIssue>;
  roles: Map<string, Roles>;
  systems: RawIssue[];
  tickets: RawIssue[];
  embers: RawIssue[];
  isSystem(id: string): boolean;
  isDrawn(id: string): boolean;
  isOpen(id: string): boolean;
  systemOf(issue: RawIssue): string | null;
  /** Open Tickets and Systems directly inside a System. */
  children(id: string): RawIssue[];
  openBlockers(issue: RawIssue): string[];
}

export function shapeOf(raw: RawGraph, remaps: LabelRemaps): Shape {
  const byId = new Map(raw.issues.map((issue) => [issue.id, issue]));
  const roles = new Map(raw.issues.map((issue) => [issue.id, labelRoles(issue, remaps)]));
  const kids = new Map<string, RawIssue[]>();
  for (const issue of raw.issues) {
    if (issue.parentId === null || !byId.has(issue.parentId)) continue;
    kids.set(issue.parentId, [...(kids.get(issue.parentId) ?? []), issue]);
  }
  const children = (id: string) => kids.get(id) ?? [];

  const systemIds = new Set<string>();
  const holdsOpen = (issue: RawIssue, seen: Set<string>): boolean =>
    !seen.has(issue.id) &&
    children(issue.id).some(
      (child) => child.state === 'open' || holdsOpen(child, new Set(seen).add(issue.id)),
    );
  for (const issue of raw.issues) {
    const role = roles.get(issue.id)!;
    const system =
      issue.state === 'open'
        ? issue.systemHint !== null ||
          role.map ||
          role.spec ||
          issue.children.total > 0 ||
          issue.childIds.length > 0 ||
          children(issue.id).length > 0
        : holdsOpen(issue, new Set());
    if (system) systemIds.add(issue.id);
  }

  const systems = raw.issues.filter((issue) => systemIds.has(issue.id));
  const tickets = raw.issues.filter((i) => i.state === 'open' && !systemIds.has(i.id));
  const pointedAt = new Set(
    raw.issues.filter((i) => i.state === 'open').flatMap((i) => i.blockedByIds),
  );
  const embers = raw.issues.filter(
    (i) => i.state === 'closed' && !systemIds.has(i.id) && pointedAt.has(i.id),
  );
  const members = new Set([...systems, ...tickets].map((issue) => issue.id));
  const drawn = new Set([...members, ...embers.map((issue) => issue.id)]);
  const isOpen = (id: string) => byId.get(id)?.state === 'open';

  return {
    byId,
    roles,
    systems,
    tickets,
    embers,
    isSystem: (id) => systemIds.has(id),
    isDrawn: (id) => drawn.has(id),
    isOpen,
    systemOf: (issue) =>
      issue.parentId !== null && systemIds.has(issue.parentId) ? issue.parentId : null,
    children: (id) => children(id).filter((child) => members.has(child.id)),
    openBlockers: (issue) => issue.blockedByIds.filter((id) => drawn.has(id) && isOpen(id)),
  };
}

export function issueRef(issue: RawIssue): IssueRef {
  const { id, handle, number, title, url, path, labels } = issue;
  return { id, handle, number, title, url, path, labels };
}
