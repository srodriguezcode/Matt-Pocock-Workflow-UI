import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { StartLabel, StartOption, StartReason } from '@contract/launch';
import type { LabelRemaps } from '@contract/repo';
import type { Sky } from '@contract/sky';
import { withDefaults } from '#server/config/store.ts';
import { rawIssue as issue } from '#server/launch/fixtures.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { githubTracker } from '#server/tracker/github/adapter.ts';
import type { RawIssue } from '#server/tracker/tracker.ts';
import type { BuiltSky } from './frontier.ts';
import { buildSky } from './model.ts';

const NOW = new Date('2026-09-25T20:00:00Z');
const repo = withDefaults({ path: '/code/harbor', owner: 'ana-reyes', name: 'harbor' });

async function recorded(fixture: string): Promise<BuiltSky> {
  const stdout = readFileSync(new URL(`./fixtures/${fixture}`, import.meta.url), 'utf8');
  const runner = new FakeRunner().on(['gh', 'api', 'graphql'], { stdout });
  return buildSky(await githubTracker(runner, repo).read(), {}, NOW);
}

const labels = (...names: string[]) => names.map((name) => ({ name, color: '' }));
const agent = labels('ready-for-agent');

function built(issues: RawIssue[], remaps: LabelRemaps = {}, viewer: string | null = 'me') {
  return buildSky({ tracker: 'github', viewer, issues }, remaps, NOW);
}

const sky = (...args: Parameters<typeof built>): Sky => built(...args).sky;

const reason = (option: StartOption | undefined): StartReason | { enabled: StartLabel } | null =>
  !option ? null : option.enabled ? { enabled: option.label } : option.reason;

const ticket = (s: Sky, id: string) => s.tickets.find((t) => t.id === id)!;
const system = (s: Sky, id: string) => s.systems.find((t) => t.id === id)!;

describe('the Harbor sky', () => {
  it('matches the recorded Sky', async () => {
    const { sky: harbor } = await recorded('harbor-graphql.json');
    await expect(`${JSON.stringify(harbor, null, 2)}\n`).toMatchFileSnapshot(
      './fixtures/harbor-sky.json',
    );
  });

  it('reads #613 Blocked + Yours and #615 Clear + Undecided', async () => {
    const { sky: harbor } = await recorded('harbor-graphql.json');
    expect(ticket(harbor, '613')).toMatchObject({
      gate: 'blocked',
      readiness: 'ready-for-human',
      light: 'blocked',
      openBlockers: ['612'],
    });
    expect(ticket(harbor, '615')).toMatchObject({
      gate: 'clear',
      readiness: 'undecided',
      light: 'undecided',
    });
  });

  it('blocks #561 through #558, which #602 gates', async () => {
    const { sky: harbor } = await recorded('harbor-graphql.json');
    expect(ticket(harbor, '561')).toMatchObject({
      gate: 'blocked',
      openBlockers: [],
      gatedBy: ['558'],
      systemId: '558',
    });
    expect(system(harbor, '558')).toMatchObject({ gated: true, openBlockers: ['602'] });
    const edge = harbor.dependencies.find((d) => d.id === '602->558');
    expect(edge).toMatchObject({ kind: 'hyperlane', systemToSystem: true, satisfied: false });
  });

  it('keeps the eight Embers', async () => {
    const { sky: harbor } = await recorded('harbor-graphql.json');
    expect(harbor.embers.map((e) => e.id).sort()).toEqual(
      ['528', '594', '600', '601', '604', '605', '606', '607'].sort(),
    );
    expect(harbor.embers.find((e) => e.id === '600')).toMatchObject({
      gate: 'done',
      blocks: ['602', '558', '615'],
    });
  });

  it('draws the Map with its Fog, Destination and Out of scope', async () => {
    const { sky: harbor } = await recorded('harbor-graphql.json');
    expect(harbor.mapId).toBe('512');
    expect(system(harbor, '512')).toMatchObject({
      kind: 'map',
      state: 'live',
      frontierSystem: false,
      arc: { closed: 31, total: 35 },
    });
    expect(harbor.fog).toHaveLength(10);
    expect(harbor.fog[1]).toMatchObject({
      id: 'fog-2',
      head: 'Et adipiscing Occaecat Duis voluptate est minim',
    });
    expect(harbor.destination).toMatch(/^Velit nibh nibh-occaecat felis/);
    expect(harbor.outOfScope[1]).toMatch(/^Duis Est\. Nostrud/);
  });

  it('reads the live recording, with its claim', async () => {
    const { sky: live } = await recorded('harbor-live-graphql.json');
    expect(ticket(live, '599')).toMatchObject({
      kind: 'decision',
      gate: 'in-flight',
      light: 'in-flight',
      claim: { holder: 'ana-reyes', ageDays: 0, heldWeek: false, mine: true },
    });
    expect(ticket(live, '613')).toMatchObject({ gate: 'blocked', readiness: 'ready-for-human' });
    expect(ticket(live, '615')).toMatchObject({ gate: 'clear', readiness: 'undecided' });
  });
});

describe('shape', () => {
  it('sorts Roots into Map, Spec, plain System and Loose ticket', () => {
    const s = sky([
      issue('1', { labels: labels('wayfinder:map') }),
      issue('2', { title: 'Spec: a thing' }),
      issue('3', { labels: labels('spec') }),
      issue('4', { children: { total: 1, closed: 1 } }),
      issue('5', { labels: agent }),
      issue('6', { parentId: '1', labels: labels('wayfinder:research') }),
    ]);
    expect(s.systems.map((x) => [x.id, x.kind, x.state])).toEqual([
      ['1', 'map', 'live'],
      ['2', 'spec', 'needs-tickets'],
      ['3', 'spec', 'needs-tickets'],
      ['4', 'plain', 'spent'],
    ]);
    expect(s.tickets.map((t) => [t.id, t.kind, t.systemId, t.light])).toEqual([
      ['5', 'build', null, 'frontier'],
      ['6', 'decision', '1', 'decision-frontier'],
    ]);
  });

  it('names a System from its title', () => {
    const titles = [
      'Spec: Scheduled sweeps — v2',
      'map: The whole board',
      'Units: the research',
      '  One plain name  ',
      'Prototype: a name far too long to fit on one sky label',
      'Spec: : notes',
    ];
    const s = sky(
      titles.flatMap((title, i) => [
        issue(`${i + 1}`, { title }),
        issue(`${i + 1}0`, { parentId: `${i + 1}` }),
      ]),
    );
    expect(s.systems.map((x) => x.name)).toEqual([
      'Scheduled sweeps',
      'The whole board',
      'Units',
      'One plain name',
      'a name far too long to fit on…',
      'Spec: : notes',
    ]);
  });

  it('keeps a Spec under the Map as its own System', () => {
    const s = sky([
      issue('1', { labels: labels('wayfinder:map') }),
      issue('2', { title: 'Spec: x', parentId: '1' }),
      issue('3', { parentId: '2', labels: agent }),
    ]);
    expect(system(s, '2').parentId).toBe('1');
    expect(system(s, '1').childIds).toEqual(['2']);
    expect(ticket(s, '3').systemId).toBe('2');
  });

  it('keeps a closed parent with an open child as a closed System', () => {
    const s = sky([
      issue('1', {
        state: 'closed',
        closeReason: 'completed',
        title: 'Spec: shipped',
        base: 'develop',
        childIds: ['2'],
        children: { total: 3, closed: 2 },
      }),
      issue('2', { parentId: '1', labels: agent }),
    ]);
    expect(system(s, '1')).toMatchObject({
      closed: true,
      state: 'live',
      frontierSystem: false,
      arc: { closed: 2, total: 3 },
      base: 'develop',
    });
    expect(ticket(s, '2')).toMatchObject({ systemId: '1', closedParentId: '1' });
    expect(s.embers).toEqual([]);
  });

  it('ignores a System’s own triage label and assignee', () => {
    const s = sky([
      issue('1', { title: 'Spec: x', labels: labels('needs-info'), assignees: ['ana'] }),
      issue('2', { parentId: '1', labels: agent }),
    ]);
    expect(system(s, '1').frontierSystem).toBe(true);
    expect(ticket(s, '2').light).toBe('frontier');
  });
});

describe('gate and light', () => {
  it('lets In flight win over Blocked, and Blocked over Readiness', () => {
    const s = sky([
      issue('1', { labels: agent }),
      issue('2', { labels: agent, blockedByIds: ['1'], assignees: ['ana'] }),
      issue('3', { labels: labels('to-be-confirmed'), blockedByIds: ['1'] }),
      issue('4', { labels: labels('ready-for-human') }),
      issue('5'),
    ]);
    expect(s.tickets.map((t) => [t.id, t.gate, t.light])).toEqual([
      ['1', 'clear', 'frontier'],
      ['2', 'in-flight', 'in-flight'],
      ['3', 'blocked', 'blocked'],
      ['4', 'clear', 'yours'],
      ['5', 'clear', 'idle'],
    ]);
    expect(ticket(s, '1').unblocks).toEqual(['2', '3']);
  });

  it('lists a System among what a ticket unblocks, sorted by id', () => {
    const s = sky([
      issue('1', { labels: agent }),
      issue('10', { labels: agent, blockedByIds: ['1'] }),
      issue('9', { title: 'Spec: gated', blockedByIds: ['1'] }),
      issue('11', { parentId: '9', labels: agent }),
    ]);
    expect(ticket(s, '1').unblocks).toEqual(['9', '10']);
  });

  it('gives a Blocked ticket the Light it takes once nothing holds it', () => {
    const s = sky([
      issue('1', { labels: agent }),
      issue('2', { labels: agent, blockedByIds: ['1'] }),
      issue('3', { labels: labels('ready-for-human'), blockedByIds: ['1'] }),
      issue('4', { labels: labels('wayfinder:research'), blockedByIds: ['1'] }),
      issue('5', { labels: labels('to-be-confirmed'), blockedByIds: ['1'] }),
      issue('6', { blockedByIds: ['1'] }),
    ]);
    expect(s.tickets.map((t) => [t.id, t.light, t.clearLight])).toEqual([
      ['1', 'frontier', 'frontier'],
      ['2', 'blocked', 'frontier'],
      ['3', 'blocked', 'yours'],
      ['4', 'blocked', 'decision-frontier'],
      ['5', 'blocked', 'undecided'],
      ['6', 'blocked', 'idle'],
    ]);
  });

  it('lets a Ruled out blocker satisfy its Dependency', () => {
    const s = sky([
      issue('1', { state: 'closed', closeReason: 'not-planned' }),
      issue('2', { state: 'closed', closeReason: 'duplicate' }),
      issue('3', { labels: agent, blockedByIds: ['1', '2'] }),
    ]);
    expect(ticket(s, '3')).toMatchObject({ gate: 'clear', light: 'frontier', openBlockers: [] });
    expect(s.embers.map((e) => [e.id, e.gate, e.blocks])).toEqual([
      ['1', 'ruled-out', ['3']],
      ['2', 'ruled-out', ['3']],
    ]);
    expect(s.dependencies.every((d) => d.satisfied && !d.hot)).toBe(true);
  });

  it('inherits blockers from every Gated System above, nearest first', () => {
    const s = sky([
      issue('9', { labels: agent, assignees: ['ana'] }),
      issue('1', { title: 'Spec: outer', blockedByIds: ['9'] }),
      issue('2', { title: 'Spec: inner', parentId: '1', outsideBlockers: ['vendor sign-off'] }),
      issue('3', { parentId: '2', labels: agent }),
    ]);
    expect(ticket(s, '3')).toMatchObject({ gate: 'blocked', gatedBy: ['2', '1'] });
    expect(s.dependencies).toEqual([
      {
        id: '9->1',
        blocker: '9',
        blocked: '1',
        kind: 'hyperlane',
        systemToSystem: false,
        satisfied: false,
        hot: true,
      },
    ]);
  });

  it('draws a Lane inside one System and a Hyperlane across', () => {
    const s = sky([
      issue('1', { title: 'Spec: a' }),
      issue('2', { title: 'Spec: b' }),
      issue('3', { parentId: '1', labels: agent }),
      issue('4', { parentId: '1', labels: agent, blockedByIds: ['3'] }),
      issue('5', { parentId: '2', labels: agent, blockedByIds: ['3'] }),
      issue('6', { labels: agent, blockedByIds: ['7'] }),
      issue('7', { labels: agent }),
    ]);
    expect(s.dependencies.map((d) => [d.id, d.kind])).toEqual([
      ['3->4', 'lane'],
      ['3->5', 'hyperlane'],
      ['7->6', 'hyperlane'],
    ]);
  });
});

describe('readiness', () => {
  it('lets the most cautious label win and flags the conflict', () => {
    const s = sky([
      issue('1', { labels: labels('ready-for-agent', 'ready-for-human') }),
      issue('2', { labels: labels('ready-for-agent', 'needs-triage') }),
      issue('3', { labels: labels('needs-triage', 'needs-info') }),
    ]);
    expect(s.tickets.map((t) => [t.readiness, t.readinessConflict, t.light])).toEqual([
      ['ready-for-human', true, 'yours'],
      ['undecided', true, 'undecided'],
      ['undecided', false, 'undecided'],
    ]);
  });

  it('reads remapped label names', () => {
    const remaps: LabelRemaps = {
      'ready-for-agent': 'afk',
      'to-be-confirmed': 'tbc',
      spec: 'epic',
      'wayfinder:': 'wf:',
    };
    const s = sky(
      [
        issue('1', { labels: labels('wf:map') }),
        issue('2', { labels: labels('epic') }),
        issue('3', { parentId: '2', labels: labels('afk') }),
        issue('4', { parentId: '1', labels: labels('wf:grilling') }),
        issue('5', { labels: labels('tbc', 'ready-for-agent') }),
      ],
      remaps,
    );
    expect(s.mapId).toBe('1');
    expect(system(s, '2').kind).toBe('spec');
    expect(ticket(s, '3').light).toBe('frontier');
    expect(ticket(s, '4').kind).toBe('decision');
    expect(ticket(s, '5')).toMatchObject({ readiness: 'undecided', readinessConflict: false });
  });
});

describe('Start options for tickets', () => {
  it('offers Start on a Frontier ticket', () => {
    expect(built([issue('613', { labels: agent })]).starts['613']).toEqual({
      enabled: true,
      target: { kind: 'ticket', id: '613' },
      label: { code: 'ticket' },
    });
  });

  it('names the first reason a ticket cannot start, own edges before the Gated System', () => {
    const inGated = (id: string, extra: Partial<RawIssue> = {}) =>
      issue(id, { parentId: '558', labels: agent, ...extra });
    const { starts } = built([
      issue('558', { title: 'Spec: Scheduled sweeps — v2', blockedByIds: ['602'] }),
      issue('602', { labels: agent }),
      issue('633', { labels: agent }),
      issue('634', { labels: agent }),
      issue('1', { labels: agent, assignees: ['me'] }),
      issue('2', { labels: agent, assignees: ['ana'] }),
      issue('3', { labels: labels('to-be-confirmed'), blockedByIds: ['633'] }),
      issue('4', { labels: agent, blockedByIds: ['633', '634'] }),
      inGated('5'),
      issue('6', { labels: labels('ready-for-human') }),
      issue('7'),
      issue('8', { labels: agent, outsideBlockers: ['design sign-off'] }),
      inGated('10', { outsideBlockers: ['legal'] }),
      inGated('11', { blockedByIds: ['633'] }),
    ]);
    expect(
      ['1', '2', '3', '4', '5', '6', '7', '8', '10', '11'].map((id) => reason(starts[id])),
    ).toEqual([
      { code: 'in-flight', holder: 'me', mine: true },
      { code: 'in-flight', holder: 'ana', mine: false },
      { enabled: { code: 'triage' } },
      { code: 'blocked-by', blockers: ['#633', '#634'], outside: [] },
      { code: 'gated', blockers: ['#602'], system: 'Scheduled sweeps' },
      { code: 'ready-for-human' },
      { enabled: { code: 'triage' } },
      { code: 'blocked-by', blockers: [], outside: ['design sign-off'] },
      { code: 'blocked-by', blockers: [], outside: ['legal'] },
      { code: 'blocked-by', blockers: ['#633'], outside: [] },
    ]);
  });

  it('names the Gated System in a gated reason by its name', () => {
    const title = 'Spec: A System whose name runs past thirty characters';
    const built_ = built([
      issue('1', { labels: agent }),
      issue('2', { title, blockedByIds: ['1'] }),
      issue('3', { parentId: '2', labels: agent }),
    ]);
    expect(reason(built_.starts['3'])).toEqual({
      code: 'gated',
      blockers: ['#1'],
      system: system(built_.sky, '2').name,
    });
    expect(system(built_.sky, '2').name).toBe('A System whose name runs past…');
  });
});

describe('Start options for Untriaged tickets', () => {
  const triage = (id: string) => ({
    enabled: true,
    target: { kind: 'triage', id },
    label: { code: 'triage' },
  });

  it('offers Triage on a Loose needs-triage ticket with no assignee', () => {
    expect(built([issue('1', { labels: labels('needs-triage') })]).starts['1']).toEqual(
      triage('1'),
    );
  });

  it('offers Triage with no Readiness, on needs-info, and when Blocked or Gated', () => {
    const { starts } = built([
      issue('9'),
      issue('1'),
      issue('2', { labels: labels('needs-info') }),
      issue('3', { labels: labels('needs-triage'), blockedByIds: ['9'] }),
      issue('4', { title: 'Spec: x', blockedByIds: ['9'] }),
      issue('5', { parentId: '4', labels: labels('to-be-confirmed') }),
    ]);
    for (const id of ['1', '2', '3', '5']) expect(starts[id]).toEqual(triage(id));
  });

  it('follows a remapped Undecided label', () => {
    const { starts } = built([issue('3', { labels: labels('triage') })], {
      'needs-triage': 'triage',
    });
    expect(starts['3']).toEqual(triage('3'));
  });

  it('offers no Triage on an assigned, Decision or ready ticket', () => {
    const { starts } = built([
      issue('600', { labels: labels('wayfinder:map') }),
      issue('1', { labels: labels('needs-triage'), assignees: ['ana'] }),
      issue('2', { parentId: '600', labels: labels('wayfinder:research', 'needs-triage') }),
      issue('3', { labels: agent }),
      issue('4', { labels: labels('ready-for-human') }),
    ]);
    expect(['1', '2', '3', '4'].map((id) => starts[id]?.target)).not.toContainEqual(
      expect.objectContaining({ kind: 'triage' }),
    );
  });
});

describe('Start options for decisions and the Map', () => {
  const map = issue('600', { labels: labels('wayfinder:map') });
  const research = labels('wayfinder:research');

  it('offers Start decision and Start the map on a Decision frontier ticket', () => {
    const { starts } = built([map, issue('601', { parentId: '600', labels: research })]);
    expect(starts['601']).toEqual({
      enabled: true,
      target: { kind: 'decision', id: '601' },
      label: { code: 'decision' },
    });
    expect(reason(starts['600'])).toEqual({ enabled: { code: 'map' } });
  });

  it('refuses a Decision frontier ticket with no Map or in another System', () => {
    expect(reason(built([issue('701', { labels: research })]).starts['701'])).toEqual({
      code: 'no-map',
    });
    const { starts } = built([
      map,
      issue('700', { title: 'Spec: x' }),
      issue('701', { parentId: '700', labels: research }),
    ]);
    expect(starts['701']).toEqual({
      enabled: false,
      target: { kind: 'decision', id: '701' },
      reason: { code: 'off-map' },
    });
  });

  it('refuses the map without a Decision frontier', () => {
    const { starts } = built([
      map,
      issue('601', { parentId: '600', labels: research, blockedByIds: ['602'] }),
      issue('602'),
    ]);
    expect(starts['600']).toEqual({
      enabled: false,
      target: { kind: 'map', id: '600' },
      reason: { code: 'no-decision-frontier' },
    });
  });
});

describe('Frontier system', () => {
  const spec = issue('1', { title: 'Spec: x' });
  const inside = (id: string, extra: Partial<RawIssue> = {}) =>
    issue(id, { parentId: '1', labels: agent, ...extra });

  it('holds when every open ticket is an agent’s build ticket held back only by Lanes', () => {
    const { sky: s, starts } = built([spec, inside('2'), inside('3', { blockedByIds: ['2'] })]);
    expect(system(s, '1')).toMatchObject({ state: 'live', frontierSystem: true });
    expect(reason(starts['1'])).toEqual({ enabled: { code: 'system', count: 2 } });
  });

  const failing: [string, RawIssue[], StartReason][] = [
    [
      'it is Spent',
      [issue('1', { title: 'Spec: x', children: { total: 2, closed: 2 } })],
      { code: 'spent' },
    ],
    [
      'it is Gated',
      [issue('1', { title: 'Spec: x', blockedByIds: ['9'] }), inside('2'), issue('9')],
      { code: 'system-gated', blockers: ['#9'] },
    ],
    [
      'it holds a System, before any ticket',
      [spec, inside('2', { assignees: ['ana'] }), issue('3', { title: 'Spec: y', parentId: '1' })],
      { code: 'child-system', handle: '#3' },
    ],
    [
      'a ticket is in flight, before any undecided one',
      [spec, inside('2', { labels: labels('needs-info') }), inside('3', { assignees: ['ana'] })],
      { code: 'ticket-in-flight', handle: '#3' },
    ],
    [
      'a ticket is a decision',
      [spec, inside('2', { labels: labels('wayfinder:research') })],
      { code: 'ticket-decision', handle: '#2' },
    ],
    [
      'a ticket is undecided',
      [spec, inside('2'), inside('3', { labels: labels('ready-for-agent', 'needs-info') })],
      { code: 'ticket-undecided', handle: '#3' },
    ],
    [
      'a ticket is for a human',
      [spec, inside('2', { labels: labels('ready-for-human') })],
      { code: 'ticket-ready-for-human', handle: '#2' },
    ],
    [
      'a ticket has no readiness',
      [spec, inside('2', { labels: [] })],
      { code: 'ticket-no-readiness', handle: '#2' },
    ],
    [
      'a blocker reaches in from outside, past a Lane',
      [spec, inside('2'), inside('3', { blockedByIds: ['2', '9'] }), issue('9')],
      { code: 'blocked-from-outside', handle: '#3', blockers: ['#9'] },
    ],
    [
      'a ticket has an outside blocker',
      [spec, inside('2', { outsideBlockers: ['legal'] })],
      { code: 'blocked-from-outside', handle: '#2', blockers: ['legal'] },
    ],
    [
      'a System above is Gated',
      [
        issue('0', { title: 'Spec: outer', blockedByIds: ['9'] }),
        issue('1', { parentId: '0', children: { total: 1, closed: 0 } }),
        inside('2'),
        issue('9'),
      ],
      { code: 'not-frontier-system' },
    ],
    [
      'it holds a closed System with an open ticket',
      [
        spec,
        inside('2'),
        issue('3', { title: 'Spec: y', parentId: '1', state: 'closed' }),
        issue('4', { parentId: '3', labels: agent }),
      ],
      { code: 'not-frontier-system' },
    ],
  ];

  it.each(failing)('fails with its reason when %s', (_why, issues, expected) => {
    const { sky: s, starts } = built(issues);
    expect(system(s, '1').frontierSystem).toBe(false);
    expect(reason(starts['1'])).toEqual(expected);
  });

  it('is never the Map', () => {
    const { sky: s, starts } = built([
      issue('1', { labels: labels('wayfinder:map') }),
      inside('2'),
    ]);
    expect(system(s, '1').frontierSystem).toBe(false);
    expect(reason(starts['1'])).toEqual({ code: 'no-decision-frontier' });
  });

  it('gives a closed System no option', () => {
    const { starts } = built([
      issue('1', { title: 'Spec: x', state: 'closed', closeReason: 'completed' }),
      inside('2'),
    ]);
    expect(starts['1']).toBeUndefined();
  });

  it('agrees with every open System’s option, in every Sky here and the recordings', async () => {
    const skies = [
      await recorded('harbor-graphql.json'),
      await recorded('harbor-live-graphql.json'),
      ...failing.map(([, issues]) => built(issues)),
    ];
    for (const { sky: s, starts } of skies) {
      for (const { id, kind, closed, frontierSystem, splitFrontier } of s.systems) {
        if (closed) expect(starts[id]).toBeUndefined();
        else if (kind !== 'map') expect(starts[id]?.enabled).toBe(frontierSystem || splitFrontier);
      }
    }
  });
});

describe('claim', () => {
  it('ages a claim and marks it stale at seven days', () => {
    const s = sky(
      [
        issue('1', { assignees: ['me'], claim: { holder: 'me', since: '2026-09-18T20:00:00Z' } }),
        issue('2', { assignees: ['ana'], claim: { holder: 'ana', since: '2026-09-19T08:00:00Z' } }),
      ],
      {},
      'me',
    );
    expect(ticket(s, '1').claim).toEqual({
      holder: 'me',
      since: '2026-09-18T20:00:00Z',
      ageDays: 7,
      heldWeek: true,
      mine: true,
    });
    expect(ticket(s, '2').claim).toMatchObject({ ageDays: 6, heldWeek: false, mine: false });
  });
});

describe('Map body', () => {
  it('reads Fog, Destination and Out of scope', () => {
    const body = [
      '## Destination',
      '',
      'A board that [starts](https://x.test) work.',
      '',
      '## Not yet specified',
      '',
      '- **Refresh cadence.** Poll or push, `60 s` for now.',
      '- Themes per repo. Maybe never.',
      '',
      '## Out of scope',
      '',
      '- **Jira.** Not ours.',
      '* Windows.',
    ].join('\n');
    const s = sky([issue('1', { labels: labels('wayfinder:map'), body })]);
    expect(s.destination).toBe('A board that starts work.');
    expect(s.fog).toEqual([
      {
        id: 'fog-1',
        head: 'Refresh cadence',
        text: 'Refresh cadence. Poll or push, 60 s for now.',
      },
      { id: 'fog-2', head: 'Themes per repo', text: 'Themes per repo. Maybe never.' },
    ]);
    expect(s.outOfScope).toEqual(['Jira. Not ours.', 'Windows.']);
  });

  it('leaves them empty without a Map', () => {
    const s = sky([issue('1', { body: '## Not yet specified\n\n- **X.**' })]);
    expect(s).toMatchObject({ mapId: null, fog: [], destination: null, outOfScope: [] });
  });
});

describe('Split frontier', () => {
  const spec = issue('1', { title: 'Spec: x' });
  const split = { enabled: { code: 'split' } };

  it('lights a Spec in Needs tickets', () => {
    const { sky: s, starts } = built([spec]);
    expect(system(s, '1')).toMatchObject({ state: 'needs-tickets', splitFrontier: true });
    expect(system(s, '1').frontierSystem).toBe(false);
    expect(reason(starts['1'])).toEqual(split);
    expect(starts['1']).toMatchObject({ target: { kind: 'split', id: '1' } });
  });

  it('reads an upstream /to-spec body as a Spec, with ready-for-agent and no other mark', () => {
    const body = [
      '## Problem Statement',
      'Sweeps run by hand.',
      '## Solution',
      'Sweeps run on a schedule.',
      '## User Stories',
      '1. As an operator, I want a nightly sweep, so that I sleep.',
      '## Implementation Decisions',
      '- A cron module.',
      '## Testing Decisions',
      '- Drive the scheduler.',
      '## Out of Scope',
      'Retries.',
      '## Further Notes',
      'None.',
    ].join('\n');
    const { sky: s, starts } = built([
      issue('1', { title: 'Scheduled sweeps', body, labels: agent }),
    ]);
    expect(system(s, '1')).toMatchObject({ kind: 'spec', splitFrontier: true });
    expect(s.tickets).toEqual([]);
    expect(reason(starts['1'])).toEqual(split);
  });

  it('keeps a decision ticket with the upstream Spec headings a decision', () => {
    const body = '## Problem Statement\n\n## Solution\n\n## Out of Scope\n';
    const { sky: s } = built([
      issue('1', { title: 'Pick one', body, labels: labels('wayfinder:grilling') }),
    ]);
    expect(s.systems).toEqual([]);
    expect(ticket(s, '1').kind).toBe('decision');
  });

  it('needs three of the upstream Spec headings', () => {
    const body = '## Problem Statement\n\nx\n\n## Solution\n\ny';
    const { sky: s } = built([issue('1', { title: 'Two headings', body, labels: agent })]);
    expect(s.systems).toEqual([]);
    expect(ticket(s, '1').kind).toBe('build');
  });

  it('stays lit when Gated', () => {
    const { sky: s, starts } = built([
      issue('1', { title: 'Spec: x', blockedByIds: ['9'] }),
      issue('9'),
    ]);
    expect(system(s, '1')).toMatchObject({ gated: true, splitFrontier: true });
    expect(reason(starts['1'])).toEqual(split);
  });

  it('goes dark with an Undecided label', () => {
    const { sky: s, starts } = built([
      issue('1', { title: 'Spec: x', labels: labels('needs-info') }),
    ]);
    expect(system(s, '1').splitFrontier).toBe(false);
    expect(reason(starts['1'])).toEqual({ code: 'undecided', label: 'needs-info' });
  });

  it('follows a remapped Undecided label', () => {
    const { starts } = built([issue('1', { title: 'Spec: x', labels: labels('maybe') })], {
      'needs-info': 'maybe',
    });
    expect(reason(starts['1'])).toEqual({ code: 'undecided', label: 'maybe' });
  });

  it('is not a Spec with tickets, a plain System or a Map', () => {
    const { sky: s } = built([
      spec,
      issue('2', { parentId: '1', labels: agent }),
      issue('3'),
      issue('4', { labels: labels('wayfinder:map') }),
    ]);
    expect(s.systems.filter((x) => x.splitFrontier)).toEqual([]);
  });

  it('leaves a closed Spec dark', () => {
    const { sky: s } = built([
      issue('1', {
        title: 'Spec: x',
        state: 'closed',
        closeReason: 'completed',
        childIds: ['2'],
        children: { total: 1, closed: 0 },
      }),
      issue('2', { parentId: '1', labels: agent }),
    ]);
    expect(system(s, '1').splitFrontier).toBe(false);
  });
});
