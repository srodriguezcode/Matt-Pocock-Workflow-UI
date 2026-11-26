import { openTab } from './commands.ts';
import { describe, expect, it } from 'vitest';
import type { LaunchEvent, LaunchPlan, LaunchTarget } from '@contract/launch';
import type { Sky } from '@contract/sky';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { testHub } from '#server/testing/fake-link.ts';
import { FakeTracker } from '#server/testing/fake-tracker.ts';
import { githubSkillArg } from '#server/tracker/github/adapter.ts';
import { executeStart } from './execute.ts';
import { repo, startable, sky, system, ticket } from './fixtures.ts';
import { planStart, type PlanInput } from './plan.ts';

const WT = '/code/app.worktrees/feature/613';

function planFor(
  target: LaunchTarget,
  s: Sky,
  local: PlanInput['local'] = { branches: [], worktrees: [] },
): LaunchPlan {
  const result = planStart({
    sky: s,
    option: startable(target),
    repo: repo(),
    target,
    base: null,
    origin: { branches: ['main'], defaultBranch: 'main' },
    local,
    commands: {
      reread: (id) => `reread ${id}`,
      claim: (id) => `claim ${id}`,
      skillArg: githubSkillArg,
      branchSlug: (ref) => String(ref.number),
    },
  });
  if (!result.ok) throw new Error(result.reason.code);
  return result.plan;
}

const ticketPlan = (local?: PlanInput['local']) =>
  planFor({ kind: 'ticket', id: '613' }, sky({ tickets: [ticket('613')] }), local);

function world() {
  const runner = new FakeRunner()
    .on(['git', 'ls-remote'], {})
    .on(['git', 'fetch'], {})
    .on(['git', 'worktree'], {})
    .on(['git', 'branch'], {})
    .on(['git', 'rev-parse'], { code: 1 })
    .on(['osascript'], {});
  const tracker = new FakeTracker({ tracker: 'github', viewer: 'me', issues: [] });
  return { runner, tracker, sessions: testHub() };
}

async function collect(plan: LaunchPlan, w: ReturnType<typeof world>): Promise<LaunchEvent[]> {
  const events: LaunchEvent[] = [];
  for await (const event of executeStart(plan, { ...w, checkout: '/code/app' })) {
    events.push(event);
  }
  return events;
}

const rollbacks = (events: LaunchEvent[]) =>
  events.flatMap((e) => (e.type === 'rollback' ? [e.command] : []));
const last = (events: LaunchEvent[]) => events[events.length - 1];

describe('executeStart on a Frontier ticket', () => {
  it('runs every step and opens the tab', async () => {
    const w = world();
    const events = await collect(ticketPlan(), w);
    expect(events.filter((e) => e.type === 'step' && e.status === 'done')).toHaveLength(6);
    expect(last(events)).toEqual({
      type: 'end',
      ok: true,
      outcome: { code: 'opened', command: `cd ${WT} && claude "/implement-ticket #613"` },
    });
    expect(w.tracker.writes).toEqual(['claim 613']);
    expect(w.runner.lines().slice(0, 3)).toEqual([
      'git ls-remote --exit-code --heads origin main',
      'git fetch origin',
      `git worktree add ${WT} -b feature/613 origin/main`,
    ]);
    const tab = w.runner.calls[3]!;
    expect(tab.command).toBe('osascript');
    expect(tab.args).toEqual(openTab(`cd ${WT} && claude "/implement-ticket #613"`).args);
    expect(w.runner.calls.every((c) => c.options.cwd === '/code/app')).toBe(true);
  });

  it('leaves the Session link knowing the opened tab, so its Session is typeable', async () => {
    const w = world();
    w.runner.on(['osascript'], { stdout: 'ABC-123\n' });
    await collect(ticketPlan(), w);
    const event = { session_id: 's1', cwd: WT, hook_event_name: 'SessionStart' } as const;
    await w.sessions.hook(undefined, event, new AbortController().signal);
    expect(w.sessions.snapshot()).toMatchObject([
      { sessionId: 's1', target: { kind: 'ticket', id: '613' }, typeable: true },
    ]);
  });

  it('stops on Taken with nothing changed', async () => {
    const w = world();
    w.tracker.takens.set('613', { code: 'held', handle: '#613', holder: 'ana' });
    const events = await collect(ticketPlan(), w);
    const taken = { code: 'held', handle: '#613', holder: 'ana' } as const;
    expect(events).toEqual([
      { type: 'step', index: 0, key: 'reread', status: 'running' },
      { type: 'taken', taken },
      { type: 'end', ok: false, outcome: { code: 'taken', taken } },
    ]);
    expect(w.runner.calls).toEqual([]);
    expect(w.tracker.writes).toEqual([]);
  });

  it('stops when the ticket was closed', async () => {
    const w = world();
    w.tracker.takens.set('613', { code: 'closed', handle: '#613' });
    const events = await collect(ticketPlan(), w);
    expect(events[1]).toEqual({ type: 'taken', taken: { code: 'closed', handle: '#613' } });
    expect(w.tracker.writes).toEqual([]);
  });

  it('reports a missing Base before claiming', async () => {
    const w = world();
    w.runner.on(['git', 'ls-remote'], { code: 2 });
    const events = await collect(ticketPlan(), w);
    expect(events).toContainEqual({
      type: 'step',
      index: 1,
      key: 'base',
      status: 'failed',
      stderr: '',
    });
    expect(rollbacks(events)).toEqual([]);
    expect(last(events)).toEqual({
      type: 'end',
      ok: false,
      outcome: {
        code: 'step-failed',
        action: { code: 'check-base', branch: 'main' },
        rollback: 'nothing-changed',
        reason: { code: 'base-missing', branch: 'main' },
      },
    });
    expect(w.tracker.writes).toEqual([]);
  });

  it('rolls back exactly what each failing step left behind, newest first', async () => {
    const cases: [string, (w: ReturnType<typeof world>) => void, string[], string[]][] = [
      ['claim', (w) => (w.tracker.failClaimOn = '613'), [], []],
      [
        'fetch',
        (w) => w.runner.on(['git', 'fetch'], { code: 1, stderr: 'no network' }),
        ['release 613'],
        ['claim 613', 'release 613 null'],
      ],
      [
        'worktree',
        (w) => w.runner.on(['git', 'worktree', 'add'], { code: 128, stderr: 'fatal: exists' }),
        ['release 613'],
        ['claim 613', 'release 613 null'],
      ],
      [
        'worktree',
        (w) =>
          w.runner
            .on(['git', 'worktree', 'add'], { code: 128, stderr: 'fatal: could not checkout' })
            .on(['git', 'rev-parse'], {}),
        ['git branch -D feature/613', 'release 613'],
        ['claim 613', 'release 613 null'],
      ],
      [
        'terminal',
        (w) => w.runner.on(['osascript'], { code: 1, stderr: 'AppleEvent timed out' }),
        [`git worktree remove --force ${WT}`, 'git branch -D feature/613', 'release 613'],
        ['claim 613', 'release 613 null'],
      ],
    ];
    for (const [key, fail, undone, writes] of cases) {
      const w = world();
      fail(w);
      const events = await collect(ticketPlan(), w);
      expect(events.find((e) => e.type === 'step' && e.status === 'failed')).toMatchObject({ key });
      expect(rollbacks(events)).toEqual(undone);
      expect(w.tracker.writes).toEqual(writes);
      expect(last(events)).toMatchObject({ type: 'end', ok: false });
    }
  });

  it('keeps a reused branch and worktree on rollback', async () => {
    const w = world();
    w.runner.on(['osascript'], { code: 1, stderr: 'boom' });
    const branchOnly = await collect(ticketPlan({ branches: ['feature/613'], worktrees: [] }), w);
    expect(w.runner.lines()).toContain(`git worktree add ${WT} feature/613`);
    expect(rollbacks(branchOnly)).toEqual([`git worktree remove --force ${WT}`, 'release 613']);

    const again = world();
    again.runner.on(['osascript'], { code: 1, stderr: 'boom' });
    const both = await collect(ticketPlan({ branches: ['feature/613'], worktrees: [WT] }), again);
    expect(again.runner.lines().some((line) => line.startsWith('git worktree'))).toBe(false);
    expect(rollbacks(both)).toEqual(['release 613']);
  });

  it('reports a rollback command that fails', async () => {
    const w = world();
    w.runner.on(['osascript'], { code: 1, stderr: 'boom' });
    w.runner.on(['git', 'branch', '-D'], { code: 1, stderr: 'not found' });
    const events = await collect(ticketPlan(), w);
    expect(events).toContainEqual({
      type: 'rollback',
      command: 'git branch -D feature/613',
      ok: false,
      stderr: 'not found',
    });
    expect(last(events)).toMatchObject({
      outcome: {
        code: 'step-failed',
        action: { code: 'open-tab' },
        rollback: 'rollback-incomplete',
      },
    });
  });
});

describe('executeStart on a Frontier system', () => {
  const s = system('70', { frontierSystem: true });
  const tickets = ['701', '702', '703'].map((id) => ticket(id, { systemId: '70' }));
  const plan = () => planFor({ kind: 'system', id: '70' }, sky({ systems: [s], tickets }));

  it('unassigns the first k-1 when the k-th claim fails', async () => {
    const w = world();
    w.tracker.previous.set('701', 'bob');
    w.tracker.failClaimOn = '703';
    const events = await collect(plan(), w);
    expect(w.tracker.writes).toEqual([
      'claim 701',
      'claim 702',
      'release 702 null',
      'release 701 bob',
    ]);
    expect(rollbacks(events)).toEqual(['release 702', 'release 701']);
    expect(w.runner.lines()).toEqual(['git ls-remote --exit-code --heads origin main']);
  });

  it('stops if any one ticket is taken', async () => {
    const w = world();
    w.tracker.takens.set('702', { code: 'held', handle: '#702', holder: 'ana' });
    const events = await collect(plan(), w);
    expect(last(events)).toEqual({
      type: 'end',
      ok: false,
      outcome: { code: 'taken', taken: { code: 'held', handle: '#702', holder: 'ana' } },
    });
    expect(w.tracker.writes).toEqual([]);
  });
});

describe('Decision and Map Starts', () => {
  const map = system('600', { kind: 'map' });
  const decision = ticket('601', { kind: 'decision', light: 'decision-frontier', systemId: '600' });
  const withMap = sky({ mapId: '600', systems: [map], tickets: [decision] });

  it('claim the decision and open the tab in the main checkout, with no git', async () => {
    const w = world();
    const events = await collect(planFor({ kind: 'decision', id: '601' }, withMap), w);
    expect(last(events)).toMatchObject({ ok: true });
    expect(w.tracker.writes).toEqual(['claim 601']);
    expect(w.runner.lines()).toEqual([expect.stringMatching(/^osascript /)]);
    expect(w.runner.lines()[0]).toContain('cd /code/app && claude \\"/wayfinder 600 601\\"');
  });

  it('start the map without a claim', async () => {
    const w = world();
    await collect(planFor({ kind: 'map', id: '600' }, withMap), w);
    expect(w.tracker.writes).toEqual([]);
    expect(w.runner.lines()).toEqual([expect.stringContaining('/wayfinder 600\\"')]);
  });
});

describe('Architecture Start', () => {
  it('opens the tab in the main checkout and registers no Session', async () => {
    const w = world();
    w.runner.on(['osascript'], { stdout: 'ABC-123\n' });
    const events = await collect(planFor({ kind: 'architecture' }, sky({})), w);
    expect(last(events)).toMatchObject({ ok: true, outcome: { code: 'opened' } });
  });
});
