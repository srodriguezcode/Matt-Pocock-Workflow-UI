import type { Label } from '@contract/sky';
import type { CloseReason, RawGraph, RawIssue } from '#server/tracker/tracker.ts';
import { baseLine } from './base.ts';
import { FLAGGED_LABEL } from './flagged-label.ts';
import { parentSection } from './parent.ts';
import type { IssueNode, RefNode, Repository, RouteNode, SkyPage, StateReason } from './query.ts';

type Local = (node: { repository?: Repository }) => boolean;

export function localTo(nameWithOwner: string): Local {
  return (node) =>
    !node.repository || node.repository.nameWithOwner.toLowerCase() === nameWithOwner.toLowerCase();
}

/** A closed parent's `body` and `base` are empty here. The adapter fills them in. */
export function toRawGraph(pages: SkyPage[], nameWithOwner: string): RawGraph {
  const local = localTo(nameWithOwner);
  const nodes = pages.flatMap((page) => page.data.repository.issues.nodes);
  const issues = new Map<string, RawIssue>();
  for (const node of nodes) issues.set(String(node.number), openIssue(node, local, nameWithOwner));
  for (const node of nodes) {
    for (const blocker of node.blockedBy.nodes.filter(local)) {
      const id = String(blocker.number);
      if (issues.has(id)) continue;
      issues.set(id, {
        ...bareIssue(blocker),
        parentId: blocker.parent ? String(blocker.parent.number) : null,
      });
    }
    const parent = node.parent;
    if (!parent || !local(parent)) continue;
    const id = String(parent.number);
    const known = issues.get(id);
    if (parent.state !== 'CLOSED') {
      if (known && !known.childIds.includes(String(node.number)))
        known.childIds.push(String(node.number));
      continue;
    }
    const closed = known ?? bareIssue(parent);
    closed.labels = labelsOf(parent);
    closed.children = {
      total: parent.subIssuesSummary.total,
      closed: parent.subIssuesSummary.completed,
    };
    if (!closed.childIds.includes(String(node.number))) closed.childIds.push(String(node.number));
    issues.set(id, closed);
  }
  const viewer = pages[0]?.data.viewer.login ?? null;
  return { tracker: 'github', viewer, issues: [...issues.values()] };
}

export function toRouteIssues(nodes: RouteNode[], parentId: string, nameWithOwner: string) {
  const local = localTo(nameWithOwner);
  return nodes.filter(local).map((node): RawIssue => ({
    ...bareIssue(node),
    parentId,
    children: { total: node.subIssuesSummary.total, closed: node.subIssuesSummary.completed },
    blockedByIds: node.blockedBy.nodes.filter(local).map((b) => String(b.number)),
  }));
}

function openIssue(node: IssueNode, local: Local, nameWithOwner: string): RawIssue {
  const assignees = node.assignees.nodes.map((a) => a.login);
  const since = node.timelineItems.nodes.at(-1)?.createdAt ?? null;
  const blockers = node.blockedBy.nodes;
  return {
    ...ref(node),
    body: node.body,
    base: baseLine(node.body),
    namedParentId: parentSection(node.body, nameWithOwner),
    assignees,
    claim: assignees.length ? { holder: assignees[0]!, since } : null,
    parentId: node.parent && local(node.parent) ? String(node.parent.number) : null,
    childIds: [],
    children: { total: node.subIssuesSummary.total, closed: node.subIssuesSummary.completed },
    blockedByIds: blockers.filter(local).map((blocker) => String(blocker.number)),
    outsideBlockers: blockers
      .filter((blocker) => !local(blocker) && blocker.state === 'OPEN')
      .map((blocker) => `${blocker.repository!.nameWithOwner}#${blocker.number}`),
  };
}

function bareIssue(node: RefNode): RawIssue {
  return {
    ...ref(node),
    body: '',
    base: null,
    namedParentId: null,
    assignees: [],
    claim: null,
    parentId: null,
    childIds: [],
    children: { total: 0, closed: 0 },
    blockedByIds: [],
  };
}

function labelsOf(node: RefNode): Label[] {
  return (node.labels?.nodes ?? []).map(({ name, color }) => ({ name, color }));
}

function ref(node: RefNode) {
  return {
    id: String(node.number),
    handle: `#${node.number}`,
    number: node.number,
    title: node.title,
    url: node.url,
    path: null,
    state: node.state === 'OPEN' ? ('open' as const) : ('closed' as const),
    createdAt: node.createdAt ?? null,
    closeReason: node.state === 'OPEN' ? null : closeReason(node.stateReason),
    labels: labelsOf(node),
    outsideBlockers: [],
    systemHint: null,
    typeLine: null,
    flagged: labelsOf(node).some((label) => label.name === FLAGGED_LABEL.name),
  };
}

function closeReason(reason: StateReason): CloseReason {
  if (reason === 'NOT_PLANNED') return 'not-planned';
  if (reason === 'DUPLICATE') return 'duplicate';
  return 'completed';
}
