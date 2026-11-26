import { describe, expect, it } from 'vitest';
import type { Sky } from '@contract/sky';
import { withDefaults } from '#server/config/store.ts';
import { readClosedRoute } from '#server/sky/closed-route.ts';
import { buildSky } from '#server/sky/model.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { issueId } from '#server/tracker/routes.ts';
import { scratchTracker } from './adapter.ts';
import { ciHooks, mixed, ROOT, SCRATCH } from './fixtures.ts';

const NOW = new Date('2026-09-25T20:00:00Z');
const repo = withDefaults({ path: ROOT, owner: 'me', name: 'app' });

async function skyOf(files: Record<string, string>): Promise<Sky> {
  return buildSky(await scratchTracker(new FakeFs(files), new FakeRunner(), repo).read(), {}, NOW)
    .sky;
}

const ticket = (s: Sky, id: string) => s.tickets.find((t) => t.id === id)!;
const system = (s: Sky, id: string) => s.systems.find((t) => t.id === id)!;

describe('the awwg ci-hooks shape', () => {
  it('draws one plain System of six Build tickets and no core', async () => {
    const s = await skyOf(ciHooks);
    expect(s).toMatchObject({ tracker: 'scratch', viewer: null, mapId: null, fog: [] });
    expect(s.systems).toEqual([
      {
        id: 'ci-hooks',
        handle: 'ci-hooks',
        number: null,
        title: 'ci-hooks',
        url: null,
        path: `${SCRATCH}/ci-hooks`,
        labels: [],
        name: 'ci-hooks',
        kind: 'plain',
        parentId: null,
        state: 'live',
        closed: false,
        gated: false,
        openBlockers: [],
        frontierSystem: false,
        splitFrontier: false,
        childIds: ['01', '02', '03', '04', '05', '06'].map((nn) => `ci-hooks/${nn}`),
        arc: { closed: 0, total: 6 },
        base: null,
        age: null,
        old: false,
        flagged: false,
        flaggedTickets: 0,
      },
    ]);
    expect(s.tickets.map((t) => [t.handle, t.kind, t.readiness, t.light])).toEqual([
      ['01', 'build', 'ready-for-agent', 'blocked'],
      ['02', 'build', 'ready-for-agent', 'blocked'],
      ['03', 'build', 'ready-for-agent', 'blocked'],
      ['04', 'build', 'ready-for-agent', 'blocked'],
      ['05', 'build', 'ready-for-agent', 'blocked'],
      ['06', 'build', 'ready-for-agent', 'blocked'],
    ]);
  });

  it('keeps the free-text blocker as text and the numbered ones as Lanes', async () => {
    const s = await skyOf(ciHooks);
    expect(ticket(s, 'ci-hooks/01')).toMatchObject({
      title: 'Config contract in the hooks repo',
      path: `${SCRATCH}/ci-hooks/issues/01-config-contract.md`,
      systemId: 'ci-hooks',
      openBlockers: [],
      outsideBlockers: ['Dana. Two things must exist first, and neither is yours to create:'],
      unblocks: ['ci-hooks/02'],
    });
    expect(ticket(s, 'ci-hooks/04').openBlockers).toEqual(['ci-hooks/02']);
    expect(s.dependencies.map((d) => [d.id, d.kind])).toEqual([
      ['ci-hooks/01->ci-hooks/02', 'lane'],
      ['ci-hooks/02->ci-hooks/03', 'lane'],
      ['ci-hooks/02->ci-hooks/04', 'lane'],
      ['ci-hooks/04->ci-hooks/05', 'lane'],
      ['ci-hooks/05->ci-hooks/06', 'lane'],
    ]);
  });
});

describe('a Map, a Spec and a plain effort', () => {
  it('reads the Map body into Destination, Fog and Out of scope', async () => {
    const s = await skyOf(mixed);
    expect(s.mapId).toBe('route');
    expect(system(s, 'route')).toMatchObject({
      kind: 'map',
      title: 'Route planner',
      path: `${SCRATCH}/route`,
      state: 'live',
      arc: { closed: 2, total: 3 },
      frontierSystem: false,
    });
    expect(s.destination).toBe('Plan a trip end to end.');
    expect(s.fog).toEqual([
      { id: 'fog-1', head: 'Offline maps', text: 'Offline maps and how they sync.' },
    ]);
    expect(s.outOfScope).toEqual(['Hotel booking']);
  });

  it('turns a Type line into a Decision ticket and keeps a resolved blocker as an Ember', async () => {
    const s = await skyOf(mixed);
    expect(ticket(s, 'route/02')).toMatchObject({
      kind: 'decision',
      gate: 'clear',
      light: 'decision-frontier',
      openBlockers: [],
    });
    expect(s.embers).toEqual([
      {
        id: 'route/01',
        handle: '01',
        number: null,
        title: 'Pick a map provider',
        url: null,
        path: `${SCRATCH}/route/issues/01-pick-provider.md`,
        labels: [],
        gate: 'done',
        blocks: ['route/02'],
      },
    ]);
    expect(s.dependencies).toContainEqual(
      expect.objectContaining({ id: 'route/01->route/02', kind: 'lane', satisfied: true }),
    );
    expect(s.tickets.some((t) => t.id === 'route/03')).toBe(false);
  });

  it('reads plain Status lines into Readiness, In flight and closed', async () => {
    const s = await skyOf(mixed);
    expect(system(s, 'export')).toMatchObject({
      kind: 'spec',
      title: 'Spec: Export',
      arc: { closed: 2, total: 5 },
    });
    expect(ticket(s, 'export/01')).toMatchObject({
      readiness: 'ready-for-agent',
      light: 'frontier',
    });
    expect(ticket(s, 'export/03')).toMatchObject({
      gate: 'in-flight',
      readiness: 'none',
      claim: { holder: null, since: null, ageDays: null, heldWeek: false },
    });
    expect(s.tickets.some((t) => t.id === 'export/04')).toBe(false);
  });

  it('reads a closed, complete or completed Status as done', async () => {
    const files: Record<string, string> = {
      [`${SCRATCH}/words/issues/01-a.md`]: '# 01 — A\n\n**Status:** closed\n',
      [`${SCRATCH}/words/issues/02-b.md`]: '# 02 — B\n\nStatus: `Complete`\n',
      [`${SCRATCH}/words/issues/03-c.md`]: '# 03 — C\n\nStatus: completed\n',
    };
    expect((await skyOf(files)).tickets).toEqual([]);
    const route = await readClosedRoute(
      scratchTracker(new FakeFs(files), new FakeRunner(), repo),
      'words',
    );
    expect(route.children.map((c) => c.gate)).toEqual(['done', 'done', 'done']);
  });

  it("reads each System's closed route from its files, out of the Sky", async () => {
    const fs = new FakeFs(mixed);
    const route = (id: string) => readClosedRoute(scratchTracker(fs, new FakeRunner(), repo), id);
    const gates = async (id: string) => (await route(id)).children.map((c) => [c.id, c.gate]);
    expect(await gates('route')).toEqual([
      ['route/01', 'done'],
      ['route/03', 'ruled-out'],
    ]);
    const exported = await route('export');
    expect(exported.systemId).toBe('export');
    expect(exported.children[1]).toMatchObject({
      id: 'export/05',
      handle: '05',
      title: 'Zip bundle',
      path: `${SCRATCH}/export/issues/05-zip.md`,
      gate: 'done',
    });
    expect(exported.lanes).toEqual([
      {
        id: 'export/04->export/05',
        blocker: 'export/04',
        blocked: 'export/05',
        kind: 'lane',
        systemToSystem: false,
        satisfied: true,
        hot: false,
      },
    ]);
    const s = await skyOf(mixed);
    expect(s.dependencies.map((d) => d.id)).not.toContain('export/04->export/05');
    expect(s.embers.map((e) => e.id)).toEqual(['route/01']);
  });

  it('splits a mixed Blocked by line into a Lane and outside blockers', async () => {
    const s = await skyOf(mixed);
    expect(ticket(s, 'export/02')).toMatchObject({
      readiness: 'ready-for-human',
      gate: 'blocked',
      openBlockers: ['export/01'],
      outsideBlockers: ['09', 'legal sign-off'],
    });
  });

  it('draws an effort with neither map nor spec as a plain System', async () => {
    const s = await skyOf(mixed);
    expect(system(s, 'cleanup')).toMatchObject({ kind: 'plain', childIds: ['cleanup/01'] });
    expect(ticket(s, 'cleanup/01')).toMatchObject({ readiness: 'undecided', light: 'undecided' });
  });

  it('draws no Hyperlanes and no Loose tickets', async () => {
    const s = await skyOf(mixed);
    expect(s.dependencies.every((d) => d.kind === 'lane')).toBe(true);
    expect(s.tickets.every((t) => t.systemId !== null)).toBe(true);
    expect(s.systems.every((sys) => sys.parentId === null && sys.base === null)).toBe(true);
  });
});

describe('the header block', () => {
  it('reads Status, Type and Blocked by only above the first section or code fence', async () => {
    const s = await skyOf({
      [`${SCRATCH}/w/issues/01-first.md`]: '# 01 — First\n\nStatus: ready-for-agent\n',
      [`${SCRATCH}/w/issues/02-quoted.md`]: [
        '# 02 — Quoted fields',
        '',
        'Some prose first.',
        '',
        '```',
        'Status: done',
        'Type: research',
        '```',
        '',
        '## Notes',
        '',
        'Blocked by: 01',
        '',
      ].join('\n'),
    });
    expect(ticket(s, 'w/02')).toMatchObject({
      kind: 'build',
      readiness: 'none',
      openBlockers: [],
    });
  });

  it('reads a bulleted Blocked by list', async () => {
    const s = await skyOf({
      [`${SCRATCH}/w/issues/01-first.md`]: '# 01 — First\n\nStatus: ready-for-agent\n',
      [`${SCRATCH}/w/issues/02-second.md`]: '# 02 — Second\n\nStatus: ready-for-agent\n',
      [`${SCRATCH}/w/issues/03-third.md`]: [
        '# 03 — Third',
        '',
        '**Blocked by:**',
        '- 01',
        '* #02',
        '- legal sign-off',
        '',
        '**Status:** ready-for-agent',
        '',
      ].join('\n'),
    });
    expect(ticket(s, 'w/03')).toMatchObject({
      openBlockers: ['w/01', 'w/02'],
      outsideBlockers: ['legal sign-off'],
    });
  });
});

describe('upstream /to-tickets output', () => {
  const ticketFile = (nn: string, title: string, blockedBy: string) =>
    [
      `# ${nn}: ${title}`,
      '',
      '**What to build:** the end-to-end behaviour.',
      '',
      `**Blocked by:** ${blockedBy}`,
      '',
      '**Status:** ready-for-agent',
      '',
      '- [ ] Acceptance criterion 1',
      '',
    ].join('\n');

  it('reads v1.3.2 root tickets as Frontier and resolves blockers named with a title', async () => {
    const s = await skyOf({
      [`${SCRATCH}/sweeps/spec.md`]: '# Scheduled sweeps\n\n## Problem Statement\n',
      [`${SCRATCH}/sweeps/issues/01-schema.md`]: ticketFile(
        '01',
        'Schema',
        'None (can start immediately)',
      ),
      [`${SCRATCH}/sweeps/issues/02-cron.md`]: ticketFile(
        '02',
        'Cron',
        'None — can start immediately',
      ),
      [`${SCRATCH}/sweeps/issues/03-api.md`]: ticketFile('03', 'API', '01 (schema)'),
      [`${SCRATCH}/sweeps/issues/04-ui.md`]: ticketFile('04', 'UI', '02:Cron, 03 — API'),
    });
    expect(
      s.tickets.map((t) => [t.id, t.title, t.light, t.openBlockers, t.outsideBlockers]),
    ).toEqual([
      ['sweeps/01', 'Schema', 'frontier', [], []],
      ['sweeps/02', 'Cron', 'frontier', [], []],
      ['sweeps/03', 'API', 'blocked', ['sweeps/01'], []],
      ['sweeps/04', 'UI', 'blocked', ['sweeps/02', 'sweeps/03'], []],
    ]);
  });

  it('reads None in any case, with any trailing text, as no blocker', async () => {
    const s = await skyOf({
      [`${SCRATCH}/w/issues/01-a.md`]: ticketFile('01', 'A', 'NONE. Starts now'),
      [`${SCRATCH}/w/issues/02-b.md`]: ticketFile('02', 'B', 'none'),
    });
    expect(s.tickets.map((t) => [t.light, t.outsideBlockers])).toEqual([
      ['frontier', []],
      ['frontier', []],
    ]);
  });
});

describe('a repo without .scratch/', () => {
  it('reads an empty sky', async () => {
    const s = await skyOf({ [`${ROOT}/README.md`]: '# app\n' });
    expect(s.systems).toEqual([]);
    expect(s.tickets).toEqual([]);
  });
});

describe('detail', () => {
  it('returns the ticket file as the body, with its path and no url', async () => {
    const tracker = scratchTracker(new FakeFs(ciHooks), new FakeRunner(), repo);
    const detail = await tracker.detail('ci-hooks/02');
    expect(detail).toMatchObject({
      id: 'ci-hooks/02',
      handle: '02',
      title: 'A pull request is checked',
      url: null,
      path: `${SCRATCH}/ci-hooks/issues/02-check-changed-files.md`,
      state: 'open',
      comments: [],
    });
    expect(detail.body).toBe(ciHooks[`${SCRATCH}/ci-hooks/issues/02-check-changed-files.md`]);
  });

  it('returns the map file as a System body', async () => {
    const tracker = scratchTracker(new FakeFs(mixed), new FakeRunner(), repo);
    const detail = await tracker.detail(issueId(tracker, 'route'));
    expect(detail).toMatchObject({ title: 'Route planner', path: `${SCRATCH}/route` });
    expect(detail.body).toContain('## Destination');
  });
});

describe('children', () => {
  it("filters read() on the System's id", async () => {
    const tracker = scratchTracker(new FakeFs(mixed), new FakeRunner(), repo);
    const children = await tracker.children('export');
    expect(children.map((c) => c.id)).toEqual([
      'export/01',
      'export/02',
      'export/03',
      'export/04',
      'export/05',
    ]);
  });

  it('is empty for a System with no tickets', async () => {
    const tracker = scratchTracker(new FakeFs(mixed), new FakeRunner(), repo);
    expect(await tracker.children('nope')).toEqual([]);
  });
});

describe('isId', () => {
  const tracker = scratchTracker(new FakeFs({}), new FakeRunner(), repo);

  it('takes only <effort>/<NN> or a bare effort', () => {
    expect(tracker.isId('board-v2/03')).toBe(true);
    expect(tracker.isId('ci-hooks')).toBe(true);
  });

  it('rejects dotfiles, nested paths and a non-numeric ticket', () => {
    for (const id of ['../03', '.hidden/03', '.hidden', '..', 'a/b/03', 'effort/x', 'a b']) {
      expect(tracker.isId(id)).toBe(false);
    }
  });
});

describe('branchSlug', () => {
  it('flattens the effort slash so the branch never nests a folder', () => {
    const tracker = scratchTracker(new FakeFs({}), new FakeRunner(), repo);
    const ref = {
      id: 'export/01',
      handle: '01',
      number: null,
      title: '',
      url: null,
      path: null,
      labels: [],
    };
    expect(tracker.branchSlug(ref)).toBe('export-01');
  });
});

describe('createdAt from git', () => {
  const added = (code = 0) =>
    new FakeRunner().on(['git', '-c', 'core.quotePath=false', 'log'], {
      code,
      stdout: [
        '@@2026-09-20T10:00:00+02:00',
        '.scratch/export/issues/02-pdf.md',
        '',
        '@@2026-09-01T09:00:00+02:00',
        '.scratch/export/spec.md',
        '.scratch/export/issues/01-csv.md',
        '',
        '@@2026-08-01T09:00:00+02:00',
        '.scratch/export/issues/02-pdf.md',
        '',
      ].join('\n'),
    });
  const read = (runner: FakeRunner) => scratchTracker(new FakeFs(mixed), runner, repo).read();

  it('dates a ticket and a System from one git call, keeping the oldest add', async () => {
    const runner = added();
    const graph = await read(runner);
    const dated = (id: string) => graph.issues.find((i) => i.id === id)!.createdAt;
    expect(dated('export/01')).toBe('2026-09-01T09:00:00+02:00');
    expect(dated('export/02')).toBe('2026-08-01T09:00:00+02:00');
    expect(dated('export')).toBe('2026-09-01T09:00:00+02:00');
    expect(dated('export/03')).toBeNull();
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]!.options.cwd).toBe(ROOT);
  });

  it('dates a System without a Map or Spec from its earliest ticket', async () => {
    const runner = new FakeRunner().on(['git', '-c', 'core.quotePath=false', 'log'], {
      stdout: '@@2026-09-02T09:00:00Z\n.scratch/cleanup/issues/01-tidy.md\n',
    });
    const graph = await read(runner);
    expect(graph.issues.find((i) => i.id === 'cleanup')!.createdAt).toBe('2026-09-02T09:00:00Z');
  });

  it('reads null outside git', async () => {
    const graph = await read(added(128));
    expect(graph.issues.every((i) => i.createdAt === null)).toBe(true);
  });
});

describe('Syncthing conflict copies', () => {
  it('are not tickets', async () => {
    const s = await skyOf({
      ...ciHooks,
      [`${SCRATCH}/ci-hooks/issues/01-first.sync-conflict-20260101-120000-ABCDEFG.md`]:
        '# 01 — Copy\n',
    });
    expect(s.tickets.map((t) => t.handle)).toEqual(['01', '02', '03', '04', '05', '06']);
  });
});
