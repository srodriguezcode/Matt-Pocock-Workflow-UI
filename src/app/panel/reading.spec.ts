import { describe, expect, it } from 'vitest';
import type { StartOption, StartReason } from '@contract/launch';
import type { Claim, Dependency, Ember, Sky, System, Ticket } from '@contract/sky';
import type { SessionState, SessionView } from '@contract/session';
import { englishMessages } from '@app/i18n/messages.en';
import type { Placed } from '@app/session/place';
import { type RoutedSky, withRoute } from '@app/sky/engine/route';
import type { Selection } from '@app/sky/engine/types';
import { harborSky, harborStarts, withClosedRoute } from '@app/sky/testing/harbor-sky';
import { type Reading, readSelection } from './reading';

const text = englishMessages.board.panel;
const codes = englishMessages.board.codes;

function read(
  sky: RoutedSky | null,
  selection: Selection,
  over: {
    offsky?: string;
    starts?: Record<string, StartOption>;
    sessions?: ReadonlyMap<string, Placed>;
  } = {},
): Reading {
  return readSelection({
    sky,
    selection,
    offsky: over.offsky ?? null,
    starts: over.starts ?? {},
    sessions: over.sessions ?? new Map(),
    text,
    codes,
  });
}

function as<K extends Reading['kind']>(reading: Reading, kind: K): Extract<Reading, { kind: K }> {
  expect(reading.kind).toBe(kind);
  return reading as Extract<Reading, { kind: K }>;
}

const harbor = () => withRoute(harborSky(), null);

function readHarbor(selection: NonNullable<Selection>): Reading {
  return read(harbor(), selection, { starts: harborStarts() });
}

const star = (id: string) => ({ kind: 'star', id }) as const;
const line = (id: string) => ({ kind: 'line', id }) as const;

function ticket(id: string, over: Partial<Ticket> = {}): Ticket {
  return {
    id,
    handle: `#${id}`,
    number: Number(id),
    title: `Ticket ${id}`,
    url: `https://github.com/acme/board/issues/${id}`,
    path: null,
    labels: [],
    kind: 'build',
    research: false,
    systemId: '10',
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
    ...over,
  };
}

function blocked(id: string, over: Partial<Ticket> = {}): Ticket {
  return ticket(id, { gate: 'blocked', light: 'blocked', ...over });
}

function system(id: string, over: Partial<System> = {}): System {
  return {
    id,
    handle: `#${id}`,
    number: Number(id),
    title: `Spec: System ${id}`,
    url: null,
    path: null,
    labels: [],
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
    ...over,
  };
}

function ember(id: string, over: Partial<Ember> = {}): Ember {
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
    ...over,
  };
}

function dep(blocker: string, blocked: string, over: Partial<Dependency> = {}): Dependency {
  return {
    id: `${blocker}->${blocked}`,
    blocker,
    blocked,
    kind: 'lane',
    systemToSystem: false,
    satisfied: false,
    hot: true,
    ...over,
  };
}

function sky(over: Partial<Sky> = {}): RoutedSky {
  return withRoute(
    {
      tracker: 'github',
      viewer: 'me',
      mapId: null,
      systems: [system('10')],
      tickets: [],
      embers: [],
      dependencies: [],
      fog: [],
      destination: null,
      outOfScope: [],
      ...over,
    },
    null,
  );
}

function readDep(s: RoutedSky, d: Dependency): Reading {
  return read(withRoute({ ...s, dependencies: [...s.dependencies, d] }, null), line(d.id));
}

function refused(id: string, reason: StartReason): Record<string, StartOption> {
  return { [id]: { enabled: false, target: { kind: 'ticket', id }, reason } };
}

function sentenceOf(reading: Reading): string {
  return 'sentence' in reading ? reading.sentence : '';
}

describe('a selected Ticket', () => {
  it('on the Frontier says what it unlocks and lists it resolved', () => {
    const frontier = as(readHarbor(star('633')), 'ticket');
    expect(frontier.sentence).toBe('Frontier: clear, ready for an agent. Unlocks 6.');
    expect(frontier.issue.handle).toBe('#633');
    expect([frontier.kindName, frontier.gate]).toEqual(['Build ticket', 'Clear']);
    expect(frontier.system).toEqual({
      id: '602',
      handle: '#602',
      title: expect.any(String),
      name: 'the Podcast section',
    });
    expect(frontier.unblocks.map((u) => u.handle)).toEqual([
      '#634',
      '#635',
      '#636',
      '#637',
      '#638',
      '#639',
    ]);
    expect(frontier.unblocks[2]).toEqual({
      id: '636',
      handle: '#636',
      title: 'Podcast: the Episode Page — listen page and player, Heard and resume, chapters',
    });
  });

  it('on the Decision frontier names the Map', () => {
    expect(sentenceOf(readHarbor(star('599')))).toBe(
      'Decision frontier: the next decision on the Map.',
    );
  });

  it('Yours says there is no Start', () => {
    expect(sentenceOf(readHarbor(star('612')))).toBe(
      'Yours: clear, ready for a human. No Start. Unlocks 1.',
    );
  });

  it('In flight counts what it unlocks', () => {
    const s = sky({
      tickets: [ticket('1', { gate: 'in-flight', light: 'in-flight', unblocks: ['2'] })],
    });
    expect(sentenceOf(read(s, star('1')))).toBe('In flight. Unlocks 1.');
  });

  it('Blocked names its own blockers from the raw Start option', () => {
    expect(sentenceOf(readHarbor(star('564')))).toBe('Blocked by #560, #562.');
    const s = sky({ tickets: [blocked('2', { outsideBlockers: ['legal'] })] });
    const starts = refused('2', { code: 'blocked-by', blockers: ['#1'], outside: ['legal'] });
    const r = as(read(s, star('2'), { starts }), 'ticket');
    expect(r.sentence).toBe('Blocked by #1, “legal”.');
    expect(r.outsideNotes).toEqual([
      'Outside blocker: “legal”. It holds the ticket until someone edits the line.',
    ]);
  });

  it('Blocked through its System names the System and what gates it', () => {
    const r = as(readHarbor(star('561')), 'ticket');
    expect(r.sentence).toBe('Blocked through its system: Scheduled Sweeps is gated by #602.');
    expect(r.inherited.map((i) => i.handle)).toEqual(['#558']);
  });

  it('Blocked without a reason naming a blocker reads bare', () => {
    const s = sky({ tickets: [blocked('2')] });
    const starts = refused('2', { code: 'undecided', label: null });
    expect(sentenceOf(read(s, star('2'), { starts }))).toBe('Blocked.');
  });

  it('Undecided and unlabelled', () => {
    expect(sentenceOf(readHarbor(star('615')))).toBe('Undecided until someone triages it.');
    const s = sky({
      tickets: [ticket('1', { readiness: 'none', light: 'idle', clearLight: 'idle' })],
    });
    const r = as(read(s, star('1')), 'ticket');
    expect(r.sentence).toBe('Clear, but it has no readiness label.');
    expect(r.readiness).toBe('—');
  });

  it('a Loose ticket has no System', () => {
    expect(as(readHarbor(star('595')), 'ticket').system).toBeNull();
  });

  it('a ticket whose System is off the Sky reads as Loose, never with an empty name', () => {
    const s = sky({ tickets: [ticket('1', { systemId: '99' }), blocked('2', { systemId: '99' })] });
    expect(as(read(s, star('1')), 'ticket').system).toBeNull();
    expect(as(readDep(s, dep('1', '2')), 'line').lines[0]).toBe(
      '#1 blocks #2 inside a Loose ticket.',
    );
  });

  it('lists a System it blocks under unblocks', () => {
    const s = sky({
      systems: [system('10'), system('20', { gated: true, openBlockers: ['1'] })],
      tickets: [ticket('1', { unblocks: ['20'] })],
    });
    const r = as(read(s, star('1')), 'ticket');
    expect(r.sentence).toBe('Frontier: clear, ready for an agent. Unlocks 1.');
    expect(r.unblocks).toEqual([{ id: '20', handle: '#20', title: 'Spec: System 20' }]);
  });

  it('notes a closed parent by its handle', () => {
    const s = sky({ embers: [ember('9')], tickets: [ticket('1', { closedParentId: '9' })] });
    expect(as(read(s, star('1')), 'ticket').closedParentNote).toBe(
      'Its parent #9 is closed, yet this ticket is still open.',
    );
  });

  it('calls out a readiness conflict and names the cautious winner', () => {
    const s = sky({
      tickets: [
        ticket('1', { readiness: 'undecided', readinessConflict: true, light: 'undecided' }),
        ticket('2'),
      ],
    });
    const r = as(read(s, star('1')), 'ticket');
    expect(r.conflictNote).toBe('labels conflict: Undecided wins');
    expect(r.readiness).toBe('Undecided');
    expect(as(read(s, star('2')), 'ticket').conflictNote).toBeNull();
  });
});

describe('Age', () => {
  it('words a Ticket and a System Age, null when unknown', () => {
    const s = sky({
      systems: [system('10', { age: 1 }), system('11')],
      tickets: [ticket('1', { age: 12 }), ticket('2', { systemId: '11' })],
    });
    expect(as(read(s, star('1')), 'ticket').age).toBe('12 days');
    expect(as(read(s, star('10')), 'system').age).toBe('1 day');
    expect(as(read(s, star('2')), 'ticket').age).toBeNull();
    expect(as(read(s, star('11')), 'system').age).toBeNull();
  });
});

describe('a Claim on a Ticket', () => {
  const claimed = (claim: Claim, session?: SessionState) => {
    const sessions = new Map<string, Placed>();
    if (session)
      sessions.set('1', { session: { state: session } as SessionView, sharedFrom: null });
    const s = sky({ tickets: [ticket('1', { claim })] });
    return as(read(s, star('1'), { sessions }), 'ticket').claim;
  };
  const weekOld: Claim = { holder: 'ana', since: null, ageDays: 9, heldWeek: true, mine: false };

  it("someone else's Stale claim flags its row and says only they can release", () => {
    expect(claimed(weekOld)).toEqual({
      line: 'Claimed by @ana · 9 d',
      row: 'Claimed by @ana · 9 d · stale',
      releaseNote: 'only @ana can release',
      stale: true,
      mine: false,
    });
  });

  it('a week-old Claim with a Working Session reads nowhere as Stale', () => {
    expect(claimed(weekOld, 'working')).toMatchObject({
      line: 'Claimed by @ana · 9 d',
      row: 'Claimed by @ana · 9 d',
      stale: false,
    });
  });

  it('a week-old Claim with an Ended Session reads as Stale in the row and the mark', () => {
    expect(claimed(weekOld, 'ended')).toMatchObject({
      row: 'Claimed by @ana · 9 d · stale',
      stale: true,
    });
  });

  it('mine carries no release note', () => {
    const claim = claimed({ holder: 'me', since: null, ageDays: 1, heldWeek: false, mine: true });
    expect(claim?.row).toBe('Claimed by @me · 1 d');
    expect(claim?.releaseNote).toBeNull();
  });

  it('a .scratch/ claim reads as yours', () => {
    const claim = claimed({
      holder: null,
      since: null,
      ageDays: null,
      heldWeek: false,
      mine: true,
    });
    expect(claim?.line).toBe('Claimed by you');
    expect(claim?.releaseNote).toBeNull();
  });
});

describe('a selected System', () => {
  it('Live counts its tickets and orders its frontier by what each unblocks', () => {
    const r = as(readHarbor(star('602')), 'system');
    expect(r.sentence).toBe(
      '11 open: 2 on the frontier, 9 blocked, 0 in flight. A Frontier system.',
    );
    expect(r.state).toBe('Live');
    expect(r.shape).toBe('System · Spec');
    expect(r.tickets).toBe('11 open · 0 closed');
    expect(r.mine).toBeNull();
    expect(r.frontier).toEqual([
      {
        title: 'Ready for an agent',
        tickets: [
          expect.objectContaining({ id: '633', handle: '#633', unlocks: ' · unlocks 6' }),
          expect.objectContaining({ id: '640', handle: '#640', unlocks: null }),
        ],
      },
    ]);
  });

  it('Map lists its Decision frontier', () => {
    const r = as(readHarbor(star('512')), 'system');
    expect(r.sentence).toBe('The Map. 1 decision on its frontier: #599.');
    expect(r.frontier.map((g) => [g.title, g.tickets.map((t) => t.id)])).toEqual([
      ['Next decisions', ['599']],
      ['Ready for a human', ['612']],
    ]);
    const empty = sky({ systems: [system('10', { kind: 'map' })] });
    expect(sentenceOf(read(empty, star('10')))).toBe('The Map. No decision on its frontier.');
  });

  it('Gated names its blockers', () => {
    const r = as(readHarbor(star('558')), 'system');
    expect(r.sentence).toBe('Gated by #602: all 4 tickets read as Blocked.');
    expect(r.state).toBe('Gated');
    expect(r.blockedBy.map((b) => b.handle)).toEqual(['#602']);
  });

  it('Needs tickets, Spent and closed', () => {
    const one = (over: Partial<System>) => read(sky({ systems: [system('10', over)] }), star('10'));
    expect(sentenceOf(one({ state: 'needs-tickets' }))).toBe(
      "Needs tickets: /to-tickets hasn't run yet.",
    );
    expect(as(one({ state: 'spent' }), 'system')).toMatchObject({
      sentence: 'Spent: every ticket is closed.',
      state: 'Spent',
    });
    expect(as(one({ closed: true }), 'system')).toMatchObject({
      sentence: 'Closed, with an open ticket still inside it.',
      state: 'Closed',
    });
  });

  it('collects my Claims inside it by id', () => {
    const claim = { holder: 'me', since: null, ageDays: 1, heldWeek: false, mine: true };
    const s = sky({
      systems: [system('10'), system('99')],
      tickets: [
        ticket('1', { claim }),
        ticket('2', { claim: { ...claim, holder: 'ana', mine: false } }),
        ticket('3', { claim, systemId: '99' }),
      ],
    });
    expect(as(read(s, star('10')), 'system').mine).toEqual({
      ids: ['1'],
      claimed: '1 ticket claimed by you',
      release: 'Release 1',
    });
  });
});

describe('a closed Star', () => {
  it('an Ember is Done and lists what it blocks', () => {
    const r = as(readHarbor(star('594')), 'ember');
    expect(r.sentence).toBe('Done.');
    expect(r.gate).toBe('Done');
    expect(r.blocks.map((b) => b.handle)).toEqual(['#602', '#558']);
  });

  it('a Ruled out closed child names its System', () => {
    const r = as(read(withClosedRoute(harborSky()), star('291')), 'closed');
    expect(r.sentence).toBe('Ruled out.');
    expect(r.gate).toBe('Ruled out');
    expect(r.system).toMatchObject({ id: '292', handle: '#292', name: 'Units' });
    expect(sentenceOf(read(withClosedRoute(harborSky()), star('290')))).toBe('Done.');
  });
});

describe('a selected line', () => {
  it('a Lane is the only thing holding a ticket that joins the Frontier', () => {
    const r = as(readHarbor(line('633->636')), 'line');
    expect(r.title).toBe('Lane');
    expect(r.state).toBe('gating: the blocker is open');
    expect(r.blocker).toEqual({ id: '633', handle: '#633', title: expect.any(String) });
    expect(r.blocked.handle).toBe('#636');
    expect(r.lines).toEqual([
      '#633 blocks #636 inside the Podcast section.',
      '#633 is the only thing holding #636. Close it and #636 goes Clear and joins the Frontier.',
    ]);
  });

  it('a ready-for-human ticket goes Clear but does not join the Frontier', () => {
    expect(as(readHarbor(line('612->613')), 'line').lines[1]).toBe(
      '#612 is the only thing holding #613. Close it and #613 goes Clear.',
    );
  });

  it('a Decision ticket becomes a Decision frontier, not a Frontier ticket', () => {
    const s = sky({
      tickets: [
        ticket('1'),
        blocked('2', { kind: 'decision', readiness: 'none', clearLight: 'decision-frontier' }),
      ],
    });
    expect(as(readDep(s, dep('1', '2')), 'line').lines[1]).toBe(
      '#1 is the only thing holding #2. Close it and #2 goes Clear and becomes a Decision frontier.',
    );
  });

  it('an In flight ticket is only held', () => {
    const s = sky({
      tickets: [ticket('1'), ticket('2', { gate: 'in-flight', light: 'in-flight' })],
    });
    expect(as(readDep(s, dep('1', '2')), 'line').lines[1]).toBe('#1 is the only thing holding #2.');
  });

  it('a Hyperlane names both places and what else still holds the ticket', () => {
    const r = as(readHarbor(line('560->568')), 'line');
    expect(r.title).toBe('Hyperlane');
    expect(r.lines).toEqual([
      '#560 (a Loose ticket) blocks #568 (in Artist Notifications).',
      "Closing #560 alone doesn't free #568: #565, #559 (Artist Notifications is Gated) still hold it.",
    ]);
  });

  it('a Hyperlane from a closed Star places it as closed', () => {
    const s = sky({
      embers: [ember('1', { blocks: ['2'] })],
      tickets: [blocked('2', { systemId: null, outsideBlockers: ['legal'] })],
    });
    expect(as(readDep(s, dep('1', '2', { kind: 'hyperlane' })), 'line').lines).toEqual([
      '#1 (closed) blocks #2 (a Loose ticket).',
      "Closing #1 alone doesn't free #2: “legal” still hold it.",
    ]);
  });

  it('a Ticket onto a System gates the whole System', () => {
    const s = sky({
      systems: [system('10'), system('20', { gated: true, openBlockers: ['1', '3'] })],
      tickets: [ticket('1'), ticket('3'), ticket('4', { systemId: '20' })],
    });
    expect(as(readDep(s, dep('1', '20', { kind: 'hyperlane' })), 'line').lines).toEqual([
      '#1 blocks the whole of System 20 (#20).',
      'System 20 is Gated: every ticket in it reads as Blocked until #1 closes.',
      "Closing #1 alone won't lift the gate: #3 still block it.",
    ]);
  });

  it('a System onto a Ticket waits for the System', () => {
    const s = sky({ systems: [system('10'), system('20')], tickets: [blocked('2')] });
    expect(as(readDep(s, dep('20', '2', { kind: 'hyperlane' })), 'line').lines[0]).toBe(
      'System 20 (#20) blocks #2, which waits for #20 to close.',
    );
  });

  it('system to system gates every ticket until the System closes', () => {
    const r = as(readHarbor(line('602->558')), 'line');
    expect(r.lines).toEqual([
      'the Podcast section (#602) blocks Scheduled Sweeps (#558), system to system.',
      'Scheduled Sweeps is Gated, so all 4 open tickets in it read as Blocked, whatever their own edges say (ADR 0001).',
      'The gate lifts when the issue #602 closes, not when its tickets do.',
    ]);
  });

  it('a satisfied edge reads as satisfied', () => {
    const r = as(readHarbor(line('600->615')), 'line');
    expect(r.title).toBe('Satisfied');
    expect(r.state).toBe('satisfied: the blocker is closed');
    expect(r.lines).toEqual(['#600 is closed, so this no longer holds #615 back.']);
  });
});

describe('the rest of the selection', () => {
  it('a Fog patch', () => {
    const r = as(readHarbor({ kind: 'fog', id: 'fog-4' }), 'fog');
    expect(r.fog.head).toBe('Adipiscing sed augue');
  });

  it('nothing selected', () => {
    expect(read(harbor(), null)).toEqual({ kind: 'none' });
  });

  it('an off-sky issue wins over the selection', () => {
    expect(read(harbor(), star('633'), { offsky: '7' })).toEqual({ kind: 'off-sky', id: '7' });
    expect(read(null, null, { offsky: '7' })).toEqual({ kind: 'off-sky', id: '7' });
  });

  it('a selection that left the Sky is gone', () => {
    expect(read(harbor(), star('1'))).toEqual({ kind: 'gone' });
    expect(read(harbor(), line('1->2'))).toEqual({ kind: 'gone' });
    expect(read(harbor(), { kind: 'fog', id: 'fog-99' })).toEqual({ kind: 'gone' });
    expect(read(harbor(), star('291'))).toEqual({ kind: 'gone' });
    expect(read(null, star('633'))).toEqual({ kind: 'gone' });
  });
});

describe('the Flag', () => {
  const open = sky({
    systems: [system('10'), system('20', { flagged: true, kind: 'map' })],
    tickets: [
      ticket('1', { flagged: true }),
      blocked('2', {
        claim: { holder: 'ana', since: null, ageDays: 1, heldWeek: false, mine: false },
      }),
      ticket('3', { systemId: null, light: 'undecided' }),
    ],
  });

  it('toggles on every open Ticket and System and reads the way it goes', () => {
    const flagOf = (id: string) => {
      const r = read(open, star(id));
      return r.kind === 'ticket' || r.kind === 'system' ? r.flag : null;
    };
    expect(flagOf('1')).toEqual({ toggle: 'Unflag', next: false });
    expect(flagOf('2')).toEqual({ toggle: 'Flag', next: true });
    expect(flagOf('3')).toEqual({ toggle: 'Flag', next: true });
    expect(flagOf('10')).toEqual({ toggle: 'Flag', next: true });
    expect(flagOf('20')).toEqual({ toggle: 'Unflag', next: false });
  });

  it('shows no flag on a closed Star', () => {
    const closed = sky({ systems: [system('10', { closed: true, flagged: true })] });
    expect(as(read(closed, star('10')), 'system')).toMatchObject({
      flag: null,
    });
    expect('flag' in readHarbor(star('594'))).toBe(false);
    expect('flag' in read(withClosedRoute(harborSky()), star('291'))).toBe(false);
  });

  it('offers no toggle on a plain .scratch/ System, which has no main file', () => {
    const plain = (tracker: 'scratch' | 'github') =>
      as(read(sky({ tracker, systems: [system('10', { kind: 'plain' })] }), star('10')), 'system');
    expect(plain('scratch').flag).toBeNull();
    expect(plain('github').flag).toEqual({ toggle: 'Flag', next: true });
  });

  it('counts Flagged tickets on a System only when there are some', () => {
    const one = (flaggedTickets: number) =>
      as(read(sky({ systems: [system('10', { flaggedTickets })] }), star('10')), 'system');
    expect(one(2).flaggedTickets).toBe('Flagged tickets: 2');
    expect(one(0).flaggedTickets).toBeNull();
  });
});
