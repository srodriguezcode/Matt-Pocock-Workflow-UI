import { describe, expect, it } from 'vitest';
import type { LaunchPlan, LaunchTarget, StartOption, StartReason } from '@contract/launch';
import type { Sky } from '@contract/sky';
import { commandLine } from '#server/core/runner.ts';
import { BOARD_PROMPT } from '#server/session/constants.ts';
import { githubSkillArg } from '#server/tracker/github/adapter.ts';
import { scratchSkillArg } from '#server/tracker/scratch/adapter.ts';
import { buildSky } from '#server/sky/model.ts';
import { TEST_LINK } from '#server/testing/fake-link.ts';
import { rawIssue, repo, sky, startable, system, ticket } from './fixtures.ts';
import { planStart, type PlanInput } from './plan.ts';

const WT = '/code/app.worktrees';
const SETTINGS = `--settings ${TEST_LINK.settingsPath} --append-system-prompt ${commandLine('', [BOARD_PROMPT]).trimStart()}`;
const env = (kind: string, id: string) => `UAW_TARGET='repo=%2Fcode%2Fapp&kind=${kind}&id=${id}'`;

function input(fields: Partial<PlanInput> & { sky: Sky; target: LaunchTarget }): PlanInput {
  return {
    option: startable(fields.target),
    repo: repo(),
    link: TEST_LINK,
    base: null,
    origin: { branches: ['develop', 'main', 'release'], defaultBranch: 'main' },
    local: { branches: [], worktrees: [] },
    commands: {
      reread: (id) => `reread ${id}`,
      claim: (id) => `claim ${id}`,
      skillArg: fields.sky.tracker === 'scratch' ? scratchSkillArg : githubSkillArg,
      branchSlug: (ref) =>
        fields.sky.tracker === 'scratch' ? ref.id.replaceAll('/', '-') : String(ref.number),
    },
    ...fields,
  };
}

function plan(fields: Parameters<typeof input>[0]): LaunchPlan {
  const result = planStart(input(fields));
  if (!result.ok) throw new Error(result.reason.code);
  return result.plan;
}

const frontier = sky({ tickets: [ticket('613')] });
const onTicket = { kind: 'ticket', id: '613' } as const;

describe('planStart on a Frontier ticket', () => {
  it('plans every step with its command', () => {
    const p = plan({ sky: frontier, target: onTicket });
    const command = `cd ${WT}/feature/613 && ${env('ticket', '613')} claude ${SETTINGS} "/implement-ticket #613"`;
    expect(p).toMatchObject({
      skill: '/implement-ticket #613',
      base: { branch: 'main', source: 'default', systemId: null },
      branch: 'feature/613',
      worktree: `${WT}/feature/613`,
      reuse: { branch: false, worktree: false },
      cwd: `${WT}/feature/613`,
      command,
      claims: ['613'],
    });
    expect(p.steps.map((s) => [s.key, s.action, s.commands])).toEqual([
      ['reread', { code: 'reread', handles: ['#613'] }, ['reread 613']],
      [
        'base',
        { code: 'check-base', branch: 'main' },
        ['git ls-remote --exit-code --heads origin main'],
      ],
      ['claim', { code: 'claim', handles: ['#613'] }, ['claim 613']],
      ['fetch', { code: 'fetch' }, ['git fetch origin']],
      [
        'worktree',
        { code: 'worktree-new', branch: 'feature/613', base: 'main' },
        [`git worktree add ${WT}/feature/613 -b feature/613 origin/main`],
      ],
      ['terminal', { code: 'open-tab' }, [expect.stringContaining('osascript -e')]],
    ]);
    const shown = p.steps[5]!.commands[0]!;
    expect(shown).toContain(`cd ${WT}/feature/613 && UAW_TARGET=`);
    expect(shown).toContain(`claude --settings ${TEST_LINK.settingsPath} --append-system-prompt `);
    expect(shown).toContain('kind=ticket&id=613');
  });

  it('refuses a star off the Frontier with its own reason', () => {
    const reason: StartReason = { code: 'blocked-by', blockers: ['#633'], outside: [] };
    const option: StartOption = { enabled: false, target: onTicket, reason };
    expect(planStart(input({ sky: frontier, target: onTicket, option }))).toEqual({
      ok: false,
      reason,
    });
  });

  it('refuses a star with no option as gone', () => {
    const result = planStart(input({ sky: frontier, target: onTicket, option: undefined }));
    expect(result).toEqual({ ok: false, reason: { code: 'gone' } });
  });

  it('refuses a target whose kind does not match the star', () => {
    const target = { kind: 'system', id: '613' } as const;
    const result = planStart(input({ sky: frontier, target, option: startable(onTicket) }));
    expect(result).toEqual({ ok: false, reason: { code: 'nothing-to-start' } });
  });
});

describe('Base resolution', () => {
  const nested = (bases: { outer?: string; inner?: string }) =>
    sky({
      systems: [
        system('50', { base: bases.outer ?? null }),
        system('60', { parentId: '50', base: bases.inner ?? null }),
      ],
      tickets: [ticket('613', { systemId: '60' })],
    });

  it('takes the nearest System that declares one', () => {
    const p = plan({ sky: nested({ outer: 'release', inner: 'develop' }), target: onTicket });
    expect(p.base).toEqual({ branch: 'develop', source: 'system', systemId: '60' });
  });

  it('walks up the parents', () => {
    const p = plan({ sky: nested({ outer: 'release' }), target: onTicket });
    expect(p.base).toEqual({ branch: 'release', source: 'system', systemId: '50' });
  });

  it("falls back to the repo's baseBranch, then the default branch", () => {
    const withRepo = plan({
      sky: nested({}),
      target: onTicket,
      repo: repo({ baseBranch: 'develop' }),
    });
    expect(withRepo.base).toEqual({ branch: 'develop', source: 'repo', systemId: null });
    expect(plan({ sky: nested({}), target: onTicket }).base?.source).toBe('default');
  });

  it('lets the override win', () => {
    const p = plan({ sky: nested({ inner: 'develop' }), target: onTicket, base: 'release' });
    expect(p.base).toEqual({ branch: 'release', source: 'override', systemId: null });
    expect(p.steps[4]!.commands[0]).toContain('origin/release');
  });

  it('inherits a Base declared on the raw System through a System without one', () => {
    const agent = [{ name: 'ready-for-agent', color: '' }];
    const { sky: built, starts } = buildSky(
      {
        tracker: 'github',
        viewer: 'me',
        issues: [
          rawIssue('50', { title: 'Spec: outer', base: 'release' }),
          rawIssue('60', { title: 'Spec: inner', parentId: '50' }),
          rawIssue('613', { parentId: '60', labels: agent }),
        ],
      },
      {},
      new Date('2026-09-25T20:00:00Z'),
    );
    const release = { branch: 'release', source: 'system', systemId: '50' };
    for (const target of [onTicket, { kind: 'system', id: '60' } as const]) {
      const p = plan({ sky: built, target, option: starts[target.id] });
      expect(p.base).toEqual(release);
    }
  });

  it('fails before any claim when origin lacks the Base', () => {
    const result = planStart(input({ sky: nested({ inner: 'gone' }), target: onTicket }));
    expect(result).toEqual({ ok: false, reason: { code: 'base-missing', branch: 'gone' } });
  });
});

describe('branch prefix', () => {
  const tagged = (tags: string[]) => sky({ tickets: [ticket('613', { tags })] });

  it('maps bug to bugfix and falls back to feature', () => {
    expect(plan({ sky: tagged(['ready-for-agent', 'bug']), target: onTicket }).branch).toBe(
      'bugfix/613',
    );
    expect(plan({ sky: tagged(['ready-for-agent']), target: onTicket }).branch).toBe('feature/613');
  });

  it('takes the first mapped label in config order', () => {
    const r = repo({
      branchPrefixes: [
        { label: 'chore', prefix: 'chore' },
        { label: 'bug', prefix: 'bugfix' },
      ],
      fallbackPrefix: 'feat',
    });
    const p = plan({ sky: tagged(['bug', 'chore']), target: onTicket, repo: r });
    expect(p.branch).toBe('chore/613');
    expect(plan({ sky: tagged([]), target: onTicket, repo: r }).branch).toBe('feat/613');
  });
});

describe('reuse', () => {
  it('adds a worktree on an existing branch without -b', () => {
    const p = plan({
      sky: frontier,
      target: onTicket,
      local: { branches: ['feature/613'], worktrees: ['/code/app'] },
    });
    expect(p.reuse).toEqual({ branch: true, worktree: false });
    expect(p.steps[4]).toEqual({
      key: 'worktree',
      action: { code: 'worktree-on-branch', branch: 'feature/613' },
      commands: [`git worktree add ${WT}/feature/613 feature/613`],
    });
  });

  it('resumes in an existing worktree', () => {
    const p = plan({
      sky: frontier,
      target: onTicket,
      local: { branches: ['feature/613'], worktrees: ['/code/app', `${WT}/feature/613`] },
    });
    expect(p.reuse).toEqual({ branch: true, worktree: true });
    expect(p.steps[4]).toEqual({
      key: 'worktree',
      action: { code: 'worktree-resume', branch: 'feature/613' },
      commands: [],
    });
  });
});

describe('planStart on a Frontier system', () => {
  const s = system('70', { frontierSystem: true, tags: ['bug'], base: 'develop' });
  const tickets = ['701', '702', '703'].map((id) => ticket(id, { systemId: '70' }));

  it('claims every open ticket on one System branch', () => {
    const p = plan({ sky: sky({ systems: [s], tickets }), target: { kind: 'system', id: '70' } });
    expect(p).toMatchObject({
      skill: '/implement-parallel #70',
      base: { branch: 'develop', source: 'system', systemId: '70' },
      branch: 'bugfix/70',
      command: `cd ${WT}/bugfix/70 && ${env('system', '70')} claude ${SETTINGS} "/implement-parallel #70"`,
      claims: ['701', '702', '703'],
    });
    const handles = ['#701', '#702', '#703'];
    expect(p.steps.map((step) => step.action)).toEqual([
      { code: 'reread', handles },
      { code: 'check-base', branch: 'develop' },
      { code: 'claim', handles },
      { code: 'fetch' },
      { code: 'worktree-new', branch: 'bugfix/70', base: 'develop' },
      { code: 'open-tab' },
    ]);
    expect(p.steps[2]!.commands).toEqual(['claim 701', 'claim 702', 'claim 703']);
  });
});

describe('Decision and Map Starts', () => {
  const map = system('600', { kind: 'map', base: 'develop' });
  const decision = ticket('601', { kind: 'decision', light: 'decision-frontier', systemId: '600' });
  const withMap = sky({ mapId: '600', systems: [map], tickets: [decision] });

  it('runs a decision in the main checkout after claiming it', () => {
    const p = plan({ sky: withMap, target: { kind: 'decision', id: '601' } });
    expect(p).toMatchObject({
      skill: '/wayfinder 600 601',
      base: null,
      branch: null,
      worktree: null,
      cwd: '/code/app',
      command: `cd /code/app && ${env('decision', '601')} claude ${SETTINGS} "/wayfinder 600 601"`,
      claims: ['601'],
    });
    expect(p.steps.map((step) => step.key)).toEqual(['reread', 'claim', 'terminal']);
  });

  it('runs the map in the main checkout with no claim', () => {
    const p = plan({ sky: withMap, target: { kind: 'map', id: '600' } });
    expect(p).toMatchObject({
      skill: '/wayfinder 600',
      base: null,
      worktree: null,
      cwd: '/code/app',
      command: `cd /code/app && ${env('map', '600')} claude ${SETTINGS} "/wayfinder 600"`,
      claims: [],
    });
    expect(p.steps.map((step) => step.key)).toEqual(['terminal']);
  });
});

describe('Architecture Start', () => {
  const target = { kind: 'architecture' } as const;
  const review = `${WT}/architecture`;
  const architecture = (fields: Partial<PlanInput> = {}) =>
    plan({ sky: sky({}), target, option: undefined, ...fields });

  it("runs the skill in a detached worktree at origin's default branch, with no claim", () => {
    const p = architecture();
    expect(p).toMatchObject({
      target,
      skill: '/improve-codebase-architecture',
      base: { branch: 'main', source: 'default', systemId: null },
      branch: null,
      worktree: review,
      reuse: { branch: false, worktree: false },
      cwd: review,
      command: `cd ${review} && claude "/improve-codebase-architecture"`,
      claims: [],
    });
    expect(p.steps.map((s) => [s.key, s.action, s.commands])).toEqual([
      [
        'base',
        { code: 'check-base', branch: 'main' },
        ['git ls-remote --exit-code --heads origin main'],
      ],
      ['fetch', { code: 'fetch' }, ['git fetch origin']],
      [
        'worktree',
        { code: 'worktree-detach', base: 'main' },
        [`git worktree add --detach ${review} origin/main`],
      ],
      ['terminal', { code: 'open-tab' }, [expect.stringContaining('osascript -e')]],
    ]);
  });

  it("takes the repo's Base before origin's default branch", () => {
    const p = architecture({ repo: repo({ baseBranch: 'develop' }) });
    expect(p.base).toEqual({ branch: 'develop', source: 'repo', systemId: null });
  });

  it('takes the picked Base over the repo Base', () => {
    const p = architecture({ repo: repo({ baseBranch: 'develop' }), base: 'release' });
    expect(p.base).toEqual({ branch: 'release', source: 'override', systemId: null });
    expect(p.steps[2]!.commands).toEqual([`git worktree add --detach ${review} origin/release`]);
  });

  it('refuses a Base that origin lacks', () => {
    const result = planStart(input({ sky: sky({}), target, option: undefined, base: 'gone' }));
    expect(result).toEqual({ ok: false, reason: { code: 'base-missing', branch: 'gone' } });
  });

  it('resets the existing review worktree to the Base instead of adding one', () => {
    const p = architecture({ base: 'develop', local: { branches: [], worktrees: [review] } });
    expect(p.reuse).toEqual({ branch: false, worktree: true });
    expect(p.steps[2]).toEqual({
      key: 'worktree',
      action: { code: 'worktree-reset', base: 'develop' },
      commands: [
        `git -C ${review} reset --hard`,
        `git -C ${review} clean -fd`,
        `git -C ${review} checkout --detach origin/develop`,
      ],
    });
  });
});

describe('.scratch/ Starts', () => {
  const root = '/code/app/.scratch/board';
  const map = system('board', { kind: 'map', path: root, handle: 'board', number: null });
  const scratchTicket = (id: string, fields: Parameters<typeof ticket>[1] = {}) =>
    ticket(id, {
      handle: id.split('/')[1],
      number: null,
      path: `${root}/issues/${id.split('/')[1]}.md`,
      ...fields,
    });

  it('passes the absolute ticket path and a flat branch name', () => {
    const t = scratchTicket('board/03');
    const p = plan({
      sky: sky({ tracker: 'scratch', tickets: [t] }),
      target: { kind: 'ticket', id: 'board/03' },
      repo: repo({ baseBranch: 'develop' }),
    });
    expect(p).toMatchObject({
      skill: `/implement-ticket ${root}/issues/03.md`,
      branch: 'feature/board-03',
      worktree: `${WT}/feature/board-03`,
      base: { branch: 'develop', source: 'repo' },
    });
    expect(p.steps[0]!.action).toEqual({ code: 'reread', handles: ['03'] });
  });

  it('passes the effort folder for a System and map.md for the Map', () => {
    const s = system('pay', { path: '/code/app/.scratch/pay', frontierSystem: true, number: null });
    const sysPlan = plan({
      sky: sky({
        tracker: 'scratch',
        systems: [s],
        tickets: [scratchTicket('pay/01', { systemId: 'pay' })],
      }),
      target: { kind: 'system', id: 'pay' },
    });
    expect(sysPlan.skill).toBe('/implement-parallel /code/app/.scratch/pay');
    expect(sysPlan.branch).toBe('feature/pay');

    const d = scratchTicket('board/02', {
      kind: 'decision',
      light: 'decision-frontier',
      systemId: 'board',
    });
    const withMap = sky({ tracker: 'scratch', mapId: 'board', systems: [map], tickets: [d] });
    expect(plan({ sky: withMap, target: { kind: 'map', id: 'board' } }).skill).toBe(
      `/wayfinder ${root}/map.md`,
    );
    expect(plan({ sky: withMap, target: { kind: 'decision', id: 'board/02' } }).skill).toBe(
      `/wayfinder ${root}/map.md ${root}/issues/02.md`,
    );
  });
});
