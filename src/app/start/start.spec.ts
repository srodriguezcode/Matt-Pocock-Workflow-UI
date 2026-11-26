import '@angular/compiler';
import {
  ApplicationRef,
  createEnvironmentInjector,
  type EnvironmentInjector,
  Injector,
  type Provider,
  provideZonelessChangeDetection,
  ɵINJECTOR_SCOPE,
} from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanRequest, SkyResponse, StartRequest } from '@contract/api';
import type { Gap } from '@contract/gap';
import type { LaunchEvent, LaunchPlan, PlanResult, StartOption } from '@contract/launch';
import type { Claim, Sky, Ticket } from '@contract/sky';
import { Api } from '@app/api/api';
import { SkyView } from '@app/sky/sky-view';
import { INSTALL_NOTE } from '@app/install-note/install-note';
import { Board } from '@app/state/board';
import { ARCHITECTURE, SESSION, Start } from './start';

const REPO = '/repo';
const target = { kind: 'ticket', id: '613' } as const;
const enabled: StartOption = { enabled: true, target, label: { code: 'ticket' } };

const claim: Claim = {
  holder: 'ana-m',
  since: '2026-09-16',
  ageDays: 1,
  heldWeek: false,
  mine: false,
};

function ticket(id: string, over: Partial<Ticket> = {}): Ticket {
  return {
    id,
    handle: `#${id}`,
    number: Number(id),
    title: `Ticket ${id}`,
    url: null,
    path: null,
    labels: [],
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
    ...over,
  };
}

function response(
  tickets: Ticket[],
  starts: Record<string, StartOption>,
  readAt = 't0',
): SkyResponse {
  const sky: Sky = {
    tracker: 'github',
    viewer: 'me',
    mapId: null,
    systems: [],
    tickets,
    embers: [],
    dependencies: [],
    fog: [],
    destination: null,
    outOfScope: [],
  };
  return { sky, starts, readAt };
}

function plan(base: string): LaunchPlan {
  return {
    target,
    skill: `/implement-ticket #613 from ${base}`,
    base: { branch: base, source: 'repo', systemId: null },
    branch: 'agent/613',
    worktree: null,
    reuse: { branch: false, worktree: false },
    cwd: REPO,
    command: 'claude',
    tmux: null,
    claims: ['613'],
    steps: [{ key: 'claim', action: { code: 'claim', handles: ['#613'] }, commands: [] }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

class FakeApi {
  skyNext: SkyResponse = response([], {});
  planCalls: { request: PlanRequest; reply: ReturnType<typeof deferred<PlanResult>> }[] = [];
  events: LaunchEvent[] = [];
  started: StartRequest[] = [];
  async sky(): Promise<SkyResponse> {
    return this.skyNext;
  }
  async branches() {
    return { branches: ['main', 'dev'], defaultBranch: 'main' };
  }
  plan(request: PlanRequest): Promise<PlanResult> {
    const reply = deferred<PlanResult>();
    this.planCalls.push({ request, reply });
    return reply.promise;
  }
  async *start(request: StartRequest): AsyncGenerator<LaunchEvent> {
    this.started.push(request);
    for (const event of this.events) yield event;
  }
}

const gap = (over: Partial<Gap>): Gap => ({
  id: 'skill',
  scope: 'repo',
  tier: 'start',
  problem: { code: 'skill-missing', skill: 'implement' },
  fix: null,
  blocks: ['ticket'],
  ids: [],
  searched: [],
  ...over,
});

const flush = () => new Promise<void>((r) => setTimeout(r));

describe('Start', () => {
  let api: FakeApi;
  let start: Start;
  let board: Board;
  let view: SkyView;
  let tick: () => void;

  beforeEach(() => {
    api = new FakeApi();
    const injector = createEnvironmentInjector(
      [
        { provide: ɵINJECTOR_SCOPE, useValue: 'root' },
        provideZonelessChangeDetection(),
        { provide: Api, useValue: api },
      ],
      Injector.create({ providers: [] }) as EnvironmentInjector,
    );
    start = injector.get(Start);
    board = injector.get(Board);
    view = injector.get(SkyView);
    const app = injector.get(ApplicationRef);
    tick = () => app.tick();
    board.activePath.set(REPO);
    tick();
  });

  afterEach(() => vi.useRealTimers());

  const show = (res: SkyResponse) => {
    board.skyResponse.set(res);
    tick();
  };
  const openSheet = (id: string) => {
    view.select({ kind: 'star', id });
    start.open(id);
    tick();
  };

  it('opens an enabled star with no Claim, and nothing without an enabled option', () => {
    const off: StartOption = { enabled: false, target, reason: { code: 'ready-for-human' } };
    show(response([ticket('613'), ticket('614')], { '613': enabled, '614': off }));
    expect(start.opens('613')).toBe(true);
    expect(start.opens('614')).toBe(false);
    expect(start.opens('615')).toBe(false);
  });

  it('keeps a star claimed elsewhere shut unless this session launched it', async () => {
    show(response([ticket('613', { claim })], { '613': enabled }));
    expect(start.opens('613')).toBe(false);

    show(response([ticket('613')], { '613': enabled }));
    api.events = [];
    const running = start.start('613', plan('main'));
    show(response([ticket('613', { claim })], { '613': enabled }));
    expect(start.launchFor('613')).not.toBeNull();
    expect(start.opens('613')).toBe(true);
    await running;
  });

  it('lets a Start-blocking Gap disable a start that covers it', () => {
    show(response([ticket('613'), ticket('614')], { '613': enabled, '614': enabled }));
    board.gaps.set([gap({ ids: ['613'] })]);
    expect(start.optionFor('613')).toEqual({
      enabled: false,
      target,
      reason: { code: 'gap', problem: { code: 'skill-missing', skill: 'implement' } },
    });
    expect(start.opens('613')).toBe(false);
    expect(start.opens('614')).toBe(true);
  });

  it('closes an open sheet when its star gets claimed elsewhere', () => {
    show(response([ticket('613')], { '613': enabled }));
    openSheet('613');
    expect(start.sheet()).toBe('613');
    show(response([ticket('613', { claim })], { '613': enabled }, 't1'));
    expect(start.sheet()).toBeNull();
  });

  it('shows the finished launch for the done delay, then closes the sheet', async () => {
    vi.useFakeTimers();
    show(response([ticket('613')], { '613': enabled }));
    openSheet('613');
    api.events = [
      { type: 'step', index: 0, key: 'claim', status: 'done' },
      { type: 'end', ok: true, outcome: { code: 'opened', command: 'claude' } },
    ];
    api.skyNext = response([ticket('613', { claim: { ...claim, mine: true } })], {}, 't1');
    await start.start('613', plan('main'));
    tick();
    expect(start.sheet()).toBe('613');
    expect(start.launchFor('613')?.end?.ok).toBe(true);

    vi.advanceTimersByTime(2600);
    tick();
    expect(start.launchFor('613')).toBeNull();
    expect(start.sheet()).toBeNull();
  });

  it('closes the sheet after the done delay even when the re-read has no Claim yet', async () => {
    vi.useFakeTimers();
    show(response([ticket('613')], { '613': enabled }));
    openSheet('613');
    api.events = [{ type: 'end', ok: true, outcome: { code: 'opened', command: 'claude' } }];
    api.skyNext = response([ticket('613')], { '613': enabled }, 't1');
    await start.start('613', plan('main'));
    vi.advanceTimersByTime(2600);
    tick();
    expect(start.sheet()).toBeNull();
  });

  it('ignores a stale plan that lands after the Base changed', async () => {
    show(response([ticket('613')], { '613': enabled }));
    openSheet('613');
    expect(api.planCalls).toHaveLength(1);

    start.pickBase('dev');
    expect(api.planCalls).toHaveLength(2);
    api.planCalls[1]!.reply.resolve({ ok: true, plan: plan('main') });
    await flush();
    expect(api.planCalls[2]!.request).toEqual({ repo: REPO, target, base: 'dev' });
    api.planCalls[2]!.reply.resolve({ ok: true, plan: plan('dev') });
    await flush();

    api.planCalls[0]!.reply.resolve({ ok: true, plan: plan('stale') });
    await flush();
    expect(start.plan()).toEqual({ ok: true, plan: plan('dev') });
    expect(start.chosen()).toBe('dev');
    expect(start.resolved()?.branch).toBe('main');
    expect(start.branches()).toEqual(['main', 'dev']);
  });

  describe('the architecture Start', () => {
    const architecture = { kind: 'architecture' } as const;

    it('opens with no star selected and plans on the repo itself', () => {
      show(response([ticket('613')], {}));
      start.open(ARCHITECTURE);
      tick();
      expect(start.sheet()).toBe(ARCHITECTURE);
      expect(start.optionFor(ARCHITECTURE)).toEqual({
        enabled: true,
        target: architecture,
        label: { code: 'architecture' },
      });
      expect(api.planCalls.map((c) => c.request)).toEqual([{ repo: REPO, target: architecture }]);
    });

    it('offers nothing before a sky loads or under a fatal Gap', () => {
      expect(start.opens(ARCHITECTURE)).toBe(false);
      show(response([], {}));
      expect(start.opens(ARCHITECTURE)).toBe(true);
      board.gaps.set([gap({ tier: 'fatal', problem: { code: 'gh-missing' }, blocks: [] })]);
      expect(start.opens(ARCHITECTURE)).toBe(false);
    });

    it('is disabled by a Gap that blocks it', () => {
      show(response([], {}));
      const problem = { code: 'skill-missing', skill: 'improve-codebase-architecture' } as const;
      board.gaps.set([gap({ problem, blocks: ['architecture'] })]);
      expect(start.optionFor(ARCHITECTURE)).toEqual({
        enabled: false,
        target: architecture,
        reason: { code: 'gap', problem },
      });
      expect(start.opens(ARCHITECTURE)).toBe(false);
    });
  });
  describe('the new-session Start', () => {
    const sessionPlan = (): LaunchPlan => ({
      ...plan('main'),
      target: start.sessionTarget(),
      base: null,
      claims: [],
      steps: [],
    });

    it('opens with no Sky, and is hidden under a fatal Gap', () => {
      expect(start.opens(SESSION)).toBe(true);
      board.gaps.set([gap({ tier: 'fatal', problem: { code: 'gh-missing' }, blocks: [] })]);
      expect(start.optionFor(SESSION)).toBeNull();
    });

    it('re-plans when the first message or the skill changes', () => {
      start.open(SESSION);
      tick();
      start.editSession({ prompt: 'Add dark mode' });
      tick();
      start.editSession({ skill: 'to-spec' });
      tick();
      start.editSession({ prompt: '', skill: null });
      tick();
      const key = start.sessionTarget().key;
      expect(api.planCalls.map((c) => c.request.target)).toEqual([
        { kind: 'session', key },
        { kind: 'session', key, prompt: 'Add dark mode' },
        { kind: 'session', key, prompt: 'Add dark mode', skill: 'to-spec' },
        { kind: 'session', key },
      ]);
    });

    it('takes a new key and an empty box after a Start opens', async () => {
      vi.useFakeTimers();
      start.open(SESSION);
      start.editSession({ prompt: 'hi' });
      tick();
      const first = start.sessionTarget().key;
      vi.advanceTimersByTime(5);
      api.events = [{ type: 'end', ok: true, outcome: { code: 'opened', command: 'claude' } }];
      await start.start(SESSION, sessionPlan());
      expect(api.started[0]?.target).toEqual({ kind: 'session', key: first, prompt: 'hi' });
      expect(start.sessionTarget().key).not.toBe(first);
      expect(start.sessionTarget()).not.toHaveProperty('prompt');
    });
  });

  describe('a Start with a tmux name', () => {
    const inContainer: LaunchPlan = { ...plan('main'), tmux: 'agent-613' };

    it('keeps the sheet open after the done delay, for the attach command', async () => {
      vi.useFakeTimers();
      show(response([ticket('613')], { '613': enabled }));
      openSheet('613');
      api.events = [{ type: 'end', ok: true, outcome: { code: 'opened', command: 'claude' } }];
      await start.start('613', inContainer);
      vi.advanceTimersByTime(2600);
      tick();
      expect(start.launchFor('613')?.plan.tmux).toBe('agent-613');
      expect(start.sheet()).toBe('613');
    });

    it('closes the sheet after the done delay on the Mac', async () => {
      vi.useFakeTimers();
      show(response([ticket('613')], { '613': enabled }));
      openSheet('613');
      api.events = [{ type: 'end', ok: true, outcome: { code: 'opened', command: 'claude' } }];
      await start.start('613', plan('main'));
      vi.advanceTimersByTime(2600);
      tick();
      expect(start.launchFor('613')).toBeNull();
      expect(start.sheet()).toBeNull();
    });
  });
});

describe('Start install note', () => {
  const startWith = (providers: Provider[]) =>
    createEnvironmentInjector(
      [
        { provide: ɵINJECTOR_SCOPE, useValue: 'root' },
        provideZonelessChangeDetection(),
        { provide: Api, useValue: new FakeApi() },
        ...providers,
      ],
      Injector.create({ providers: [] }) as EnvironmentInjector,
    ).get(Start);

  it('shows the install note in place of Launch in the Demo', () => {
    expect(startWith([{ provide: INSTALL_NOTE, useValue: true }]).installNote).toBe(true);
  });

  it('keeps Launch in the real build', () => {
    expect(startWith([]).installNote).toBe(false);
  });
});
