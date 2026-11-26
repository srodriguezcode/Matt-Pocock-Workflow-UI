import { describe, expect, it } from 'vitest';
import type { DemoRelease, DemoRepoSnapshot, DemoSnapshot } from '@contract/demo';
import type { PlanResult } from '@contract/launch';
import type { System, Ticket } from '@contract/sky';
import { DemoStore, loadSnapshot } from './demo-store';

const PATH = '/Users/ana-reyes/code/shelf';

const planned: PlanResult = {
  ok: true,
  plan: {
    target: { kind: 'ticket', id: 'inbox/03' },
    skill: '/implement-ticket inbox/03',
    base: { branch: 'main', source: 'default', systemId: null },
    branch: 'feature/inbox-03',
    worktree: '/Users/ana-reyes/code/shelf.worktrees/feature/inbox-03',
    reuse: { branch: false, worktree: false },
    cwd: '/Users/ana-reyes/code/shelf.worktrees/feature/inbox-03',
    command: 'claude',
    tmux: null,
    claims: ['inbox/03'],
    steps: [],
  },
};

function shelf(): DemoRepoSnapshot {
  return {
    repo: {
      path: PATH,
      owner: 'ana-reyes',
      name: 'shelf',
      branchPrefixes: [],
      fallbackPrefix: 'feature',
      labels: {},
      tile: { letters: 'SH' },
    },
    sky: {
      sky: {
        tracker: 'scratch',
        viewer: null,
        mapId: null,
        systems: [],
        tickets: [],
        embers: [],
        dependencies: [],
        fog: [],
        destination: null,
        outOfScope: [],
      },
      starts: {
        'inbox/03': {
          enabled: true,
          target: { kind: 'ticket', id: 'inbox/03' },
          label: { code: 'ticket' },
        },
        'inbox/02': {
          enabled: false,
          target: { kind: 'ticket', id: 'inbox/02' },
          reason: { code: 'ready-for-human' },
        },
      },
      readAt: '2026-10-01T09:00:00.000Z',
    },
    issues: {
      'inbox/03': {
        id: 'inbox/03',
        handle: '03',
        number: null,
        title: 'Sort by title',
        url: null,
        path: null,
        labels: [],
        state: 'open',
        body: '# 03',
        comments: [],
      },
    },
    routes: { 'lend-books': { systemId: 'lend-books', children: [], lanes: [] } },
    plans: [{ target: { kind: 'ticket', id: 'inbox/03' }, result: planned }],
    refusals: {},
    releases: {},
    gaps: { gaps: [] },
    branches: { branches: ['main'], defaultBranch: 'main' },
  };
}

const snapshot = (): DemoSnapshot => ({ repos: [shelf()] });

const ref = (id: string) => ({
  id,
  handle: id.split('/').pop()!,
  number: null,
  title: id,
  url: null,
  path: null,
  labels: [],
});

function ticket(id: string, systemId: string, extra: Partial<Ticket> = {}): Ticket {
  return {
    ...ref(id),
    kind: 'build',
    research: false,
    systemId,
    gate: 'clear',
    readiness: 'ready-for-agent',
    readinessConflict: false,
    light: 'frontier',
    clearLight: 'frontier',
    claim: null,
    openBlockers: [],
    gatedBy: [],
    outsideBlockers: [],
    unblocks: [],
    closedParentId: null,
    namedParentId: null,
    age: 3,
    old: false,
    flagged: false,
    ...extra,
  };
}

function system(id: string, kind: System['kind'], childIds: string[]): System {
  return {
    ...ref(id),
    name: id,
    kind,
    parentId: null,
    state: 'live',
    closed: false,
    gated: false,
    openBlockers: [],
    frontierSystem: false,
    splitFrontier: false,
    childIds,
    arc: { closed: 0, total: childIds.length },
    base: null,
    age: 5,
    old: false,
    flagged: false,
    flaggedTickets: 0,
  };
}

const CLAIM = {
  holder: null,
  since: '2026-09-22T15:55:12.000Z',
  ageDays: 9,
  heldWeek: true,
  mine: true,
};

const refused = (id: string) => ({
  id,
  error: `release ${id}: not claimed, Status ready-for-agent`,
  reason: { code: 'not-claimed' as const, status: 'ready-for-agent' },
});

const CLAIMED = ['scan/02', 'scan/04'];

function releaseOf(base: DemoRepoSnapshot, ids: string[]): DemoRelease {
  const sky = structuredClone(base.sky);
  sky.sky.tickets = sky.sky.tickets.map((t) => (ids.includes(t.id) ? ticket(t.id, 'scan') : t));
  for (const id of ids)
    sky.starts[id] = { enabled: true, target: { kind: 'ticket', id }, label: { code: 'ticket' } };
  return {
    sky,
    issues: Object.fromEntries(
      ids.map((id) => [id, { ...base.issues[id]!, body: `# ${id}\n\nStatus: ready-for-agent\n` }]),
    ),
    plans: [],
    refusals: Object.fromEntries(ids.map((id) => [id, refused(id)])),
  };
}

function writable(): DemoSnapshot {
  const base = shelf();
  base.sky.sky.systems = [
    system('scan', 'spec', ['scan/02', 'scan/03', 'scan/04']),
    system('maps', 'map', ['maps/01']),
  ];
  const inFlight = (id: string) =>
    ticket(id, 'scan', {
      gate: 'in-flight',
      readiness: 'none',
      light: 'in-flight',
      clearLight: 'idle',
      claim: CLAIM,
    });
  base.sky.sky.tickets = [
    inFlight('scan/02'),
    ticket('scan/03', 'scan'),
    inFlight('scan/04'),
    ticket('maps/01', 'maps', { kind: 'decision', readiness: 'none' }),
  ];
  for (const id of CLAIMED)
    base.issues[id] = {
      ...ref(id),
      state: 'open',
      body: `# ${id}\n\nStatus: claimed\n`,
      comments: [],
    };
  for (const ids of [['scan/02'], ['scan/04'], CLAIMED])
    base.releases[ids.join(',')] = releaseOf(base, ids);
  const other = shelf();
  other.repo = { ...other.repo, path: '/Users/ana-reyes/code/portfolio', name: 'portfolio' };
  return { repos: [base, other] };
}

const tickets = (store: DemoStore) => store.sky(PATH)!.sky.tickets;
const ticketOf = (store: DemoStore, id: string) => tickets(store).find((t) => t.id === id)!;

describe('DemoStore', () => {
  it('serves each read from the snapshot', () => {
    const store = new DemoStore(snapshot());
    expect(store.repos().map((r) => r.path)).toEqual([PATH]);
    expect(store.sky(PATH)?.readAt).toBe('2026-10-01T09:00:00.000Z');
    expect(store.issue(PATH, 'inbox/03')?.title).toBe('Sort by title');
    expect(store.route(PATH, 'lend-books')?.systemId).toBe('lend-books');
    expect(store.branches(PATH)?.defaultBranch).toBe('main');
    expect(store.gaps(PATH)).toEqual({ gaps: [] });
  });

  it('answers nothing for a repo or id the snapshot lacks', () => {
    const store = new DemoStore(snapshot());
    expect(store.sky('/elsewhere')).toBeNull();
    expect(store.issue(PATH, 'inbox/99')).toBeNull();
    expect(store.plan({ repo: '/elsewhere', target: { kind: 'architecture' } })).toBeNull();
  });

  it('gives no machine Gaps when no repo is named', () => {
    expect(new DemoStore(snapshot()).gaps(null)).toEqual({ gaps: [] });
  });

  it('plans a Start-able star and refuses the rest', () => {
    const store = new DemoStore(snapshot());
    const plan = (target: Parameters<DemoStore['plan']>[0]['target']) =>
      store.plan({ repo: PATH, target });
    expect(plan({ kind: 'ticket', id: 'inbox/03' })).toEqual(planned);
    expect(plan({ kind: 'ticket', id: 'inbox/02' })).toEqual({
      ok: false,
      reason: { code: 'ready-for-human' },
    });
    expect(plan({ kind: 'architecture' })).toEqual({ ok: false, reason: { code: 'gone' } });
  });

  it('keeps its copy apart from the snapshot and from what it hands out', () => {
    const source = snapshot();
    const store = new DemoStore(source);
    source.repos[0]!.repo.name = 'changed';
    store.sky(PATH)!.sky.fog.push({ id: 'fog-1', head: 'x', text: 'x' });
    expect(store.repos()[0]!.name).toBe('shelf');
    expect(store.sky(PATH)!.sky.fog).toEqual([]);
  });
});

describe('DemoStore writes', () => {
  it('flags a ticket and echoes it on its System until it is unflagged', () => {
    const store = new DemoStore(writable());
    expect(store.flag(PATH, 'scan/03', true)).toBe(true);
    expect(ticketOf(store, 'scan/03').flagged).toBe(true);
    expect(store.sky(PATH)!.sky.systems.find((s) => s.id === 'scan')!.flaggedTickets).toBe(1);
    store.flag(PATH, 'scan/03', false);
    expect(ticketOf(store, 'scan/03').flagged).toBe(false);
    expect(store.sky(PATH)!.sky.systems.find((s) => s.id === 'scan')!.flaggedTickets).toBe(0);
  });

  it('flags a System itself and counts no Flag on a Map', () => {
    const store = new DemoStore(writable());
    store.flag(PATH, 'scan', true);
    store.flag(PATH, 'maps/01', true);
    const systems = store.sky(PATH)!.sky.systems;
    expect(systems.find((s) => s.id === 'scan')!.flagged).toBe(true);
    expect(systems.find((s) => s.id === 'maps')!.flaggedTickets).toBe(0);
  });

  it('refuses a Flag on an id the repo lacks', () => {
    const store = new DemoStore(writable());
    expect(store.flag(PATH, 'scan/99', true)).toBe(false);
    expect(store.flag('/elsewhere', 'scan/02', true)).toBe(false);
  });

  it('swaps in the Sky, issue and plans the snapshot read after the Release', () => {
    const source = writable();
    const store = new DemoStore(source);
    expect(store.release(PATH, ['scan/02'])).toEqual({ released: ['scan/02'], failed: [] });
    const after = source.repos[0]!.releases['scan/02']!;
    expect(store.sky(PATH)).toEqual(after.sky);
    expect(store.issue(PATH, 'scan/02')).toEqual(after.issues['scan/02']);
    expect(store.plan({ repo: PATH, target: { kind: 'ticket', id: 'inbox/03' } })).toEqual({
      ok: false,
      reason: { code: 'gone' },
    });
  });

  it('reads the same board after two Releases as after one Release of both', () => {
    const source = writable();
    const apart = new DemoStore(source);
    apart.release(PATH, ['scan/04']);
    expect(apart.release(PATH, ['scan/02'])).toEqual({ released: ['scan/02'], failed: [] });
    const together = new DemoStore(source);
    expect(together.release(PATH, CLAIMED)).toEqual({ released: CLAIMED, failed: [] });
    const both = source.repos[0]!.releases[CLAIMED.join(',')]!;
    for (const store of [apart, together]) {
      expect(store.sky(PATH)).toEqual(both.sky);
      for (const id of CLAIMED) expect(store.issue(PATH, id)).toEqual(both.issues[id]);
    }
  });

  it('keeps the Flags set before each Release', () => {
    const store = new DemoStore(writable());
    store.flag(PATH, 'scan/03', true);
    store.flag(PATH, 'scan', true);
    store.release(PATH, ['scan/02']);
    store.flag(PATH, 'scan/04', true);
    store.release(PATH, ['scan/04']);
    expect(ticketOf(store, 'scan/03').flagged).toBe(true);
    expect(ticketOf(store, 'scan/04')).toMatchObject({ gate: 'clear', flagged: true });
    const scan = store.sky(PATH)!.sky.systems.find((s) => s.id === 'scan')!;
    expect(scan).toMatchObject({ flagged: true, flaggedTickets: 2 });
  });

  it('refuses a second Release of the same ticket, as the server does', () => {
    const store = new DemoStore(writable());
    store.release(PATH, ['scan/02']);
    expect(store.release(PATH, ['scan/02', 'scan/99'])).toEqual({
      released: [],
      failed: [refused('scan/02'), { id: 'scan/99', error: 'Demo: no ticket scan/99' }],
    });
    expect(ticketOf(store, 'scan/02').gate).toBe('clear');
    expect(ticketOf(store, 'scan/04').gate).toBe('in-flight');
  });

  it('reorders the Rail and refuses an order that skips or repeats a repo', () => {
    const store = new DemoStore(writable());
    const portfolio = '/Users/ana-reyes/code/portfolio';
    expect(store.reorder([portfolio, PATH])!.map((r) => r.path)).toEqual([portfolio, PATH]);
    expect(store.repos().map((r) => r.path)).toEqual([portfolio, PATH]);
    expect(store.reorder([PATH])).toBeNull();
    expect(store.reorder([PATH, PATH])).toBeNull();
    expect(store.reorder([PATH, '/elsewhere'])).toBeNull();
    expect(store.repos().map((r) => r.path)).toEqual([portfolio, PATH]);
  });

  it('starts each new store from the snapshot', () => {
    const source = writable();
    const first = new DemoStore(source);
    first.flag(PATH, 'scan/03', true);
    first.release(PATH, ['scan/02']);
    first.reorder(['/Users/ana-reyes/code/portfolio', PATH]);
    const second = new DemoStore(source);
    expect(ticketOf(second, 'scan/03').flagged).toBe(false);
    expect(ticketOf(second, 'scan/02').gate).toBe('in-flight');
    expect(second.repos()[0]!.path).toBe(PATH);
  });
});

describe('loadSnapshot', () => {
  it('reads the snapshot file', async () => {
    const get = async () => new Response(JSON.stringify(snapshot()));
    expect((await loadSnapshot('demo/snapshot.json', get))?.repos).toHaveLength(1);
  });

  it('gives nothing when the file is missing', async () => {
    const missing = async () => new Response('', { status: 404 });
    expect(await loadSnapshot('demo/snapshot.json', missing)).toBeNull();
  });
});
