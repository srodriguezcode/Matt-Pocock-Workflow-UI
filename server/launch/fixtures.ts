import type { LaunchTarget, StartLabel, StartOption } from '@contract/launch';
import type { RepoConfig } from '@contract/repo';
import type { Ember, Sky, System, Ticket } from '@contract/sky';
import { withDefaults } from '#server/config/store.ts';
import type { RawIssue } from '#server/tracker/tracker.ts';

const labels = (names: string[]) => names.map((name) => ({ name, color: '' }));

export function ticket(id: string, fields: Partial<Ticket> & { tags?: string[] } = {}): Ticket {
  const { tags = ['ready-for-agent'], ...rest } = fields;
  return {
    id,
    handle: `#${id}`,
    number: Number(id),
    title: `Ticket ${id}`,
    url: null,
    path: null,
    labels: labels(tags),
    kind: 'build',
    research: false,
    systemId: null,
    gate: 'clear',
    readiness: 'ready-for-agent',
    readinessConflict: false,
    light: 'frontier',
    claim: null,
    openBlockers: [],
    gatedBy: [],
    outsideBlockers: [],
    unblocks: [],
    clearLight: 'frontier',
    closedParentId: null,
    namedParentId: null,
    age: null,
    old: false,
    flagged: false,
    ...rest,
  };
}

export function system(id: string, fields: Partial<System> & { tags?: string[] } = {}): System {
  const { tags = [], ...rest } = fields;
  return {
    id,
    handle: `#${id}`,
    number: Number(id),
    title: `Spec: System ${id}`,
    url: null,
    path: null,
    labels: labels(tags),
    name: `System ${id}`,
    kind: 'spec',
    parentId: null,
    state: 'live',
    closed: false,
    gated: false,
    openBlockers: [],
    frontierSystem: false,
    splitFrontier: false,
    childIds: [],
    arc: { closed: 0, total: 0 },
    base: null,
    age: null,
    old: false,
    flagged: false,
    flaggedTickets: 0,
    ...rest,
  };
}

export function ember(id: string): Ember {
  return {
    id,
    handle: `#${id}`,
    number: Number(id),
    title: `Ember ${id}`,
    url: null,
    path: null,
    labels: [],
    gate: 'done',
    blocks: [],
  };
}

export function sky(fields: Partial<Sky>): Sky {
  return {
    tracker: 'github',
    viewer: 'me',
    mapId: null,
    systems: [],
    tickets: [],
    embers: [],
    dependencies: [],
    fog: [],
    destination: null,
    outOfScope: [],
    ...fields,
  };
}

export function repo(fields: Partial<RepoConfig> = {}): RepoConfig {
  return withDefaults({ path: '/code/app', owner: 'me', name: 'app', ...fields });
}

export function startable(target: LaunchTarget): StartOption {
  const label: StartLabel =
    target.kind === 'system' ? { code: 'system', count: 0 } : { code: target.kind };
  return { enabled: true, target, label };
}

export function rawIssue(id: string, extra: Partial<RawIssue> = {}): RawIssue {
  return {
    id,
    handle: `#${id}`,
    number: Number(id),
    title: `Issue ${id}`,
    body: '',
    url: null,
    path: null,
    state: 'open',
    createdAt: null,
    closeReason: null,
    labels: [],
    assignees: [],
    claim: null,
    parentId: null,
    childIds: [],
    children: { total: 0, closed: 0 },
    blockedByIds: [],
    outsideBlockers: [],
    systemHint: null,
    typeLine: null,
    base: null,
    namedParentId: null,
    flagged: false,
    ...extra,
  };
}
