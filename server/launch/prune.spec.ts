import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StarTarget } from '@contract/launch';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { FakeTracker } from '#server/testing/fake-tracker.ts';
import { ember, rawIssue, repo, sky, system, ticket } from './fixtures.ts';
import { pruneWorktrees } from './prune.ts';

const WT = '/code/app.worktrees';
const list = (...paths: string[]) =>
  ['/code/app', ...paths].map((p) => `worktree ${p}\nHEAD abc\nbranch refs/heads/x\n`).join('\n');
const removed = (runner: FakeRunner) =>
  runner.lines().filter((l) => l.startsWith('git worktree remove'));

let runner: FakeRunner;
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  runner = new FakeRunner();
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

function run(options: {
  worktrees: string[];
  live?: StarTarget[];
  closed?: string[];
  failRemove?: string;
  fixture?: Parameters<typeof sky>[0];
}) {
  runner.on(['git', 'worktree', 'remove'], {});
  if (options.failRemove) {
    runner.on(['git', 'worktree', 'remove', '--force', options.failRemove], {
      code: 1,
      stderr: 'locked',
    });
  }
  runner.on(['git', 'worktree', 'list'], { stdout: list(...options.worktrees) });
  const tracker = new FakeTracker({
    tracker: 'github',
    viewer: null,
    issues: (options.closed ?? []).map((id) => rawIssue(id, { state: 'closed' })),
  });
  return pruneWorktrees({
    runner,
    tracker,
    repo: repo(),
    sky: sky(options.fixture ?? {}),
    live: options.live ?? [],
  });
}

describe('pruneWorktrees', () => {
  it('removes a closed ticket with no live Session and keeps the branch', async () => {
    await run({ worktrees: [`${WT}/feature/7`], closed: ['7'] });
    expect(removed(runner)).toEqual([`git worktree remove --force ${WT}/feature/7`]);
    expect(runner.lines().some((l) => l.includes('branch -D'))).toBe(false);
  });

  it('removes an Ember and a kept closed System', async () => {
    await run({
      worktrees: [`${WT}/feature/8`, `${WT}/feature/9`],
      fixture: { embers: [ember('8')], systems: [system('9', { closed: true })] },
    });
    expect(removed(runner)).toHaveLength(2);
  });

  it('keeps an open ticket and an open System', async () => {
    await run({
      worktrees: [`${WT}/feature/1`, `${WT}/feature/2`],
      fixture: { tickets: [ticket('1')], systems: [system('2')] },
    });
    expect(removed(runner)).toEqual([]);
  });

  it('keeps a closed ticket whose Session is live', async () => {
    await run({
      worktrees: [`${WT}/feature/7`],
      closed: ['7'],
      live: [{ kind: 'ticket', id: '7' }],
    });
    expect(removed(runner)).toEqual([]);
  });

  it('keeps a worktree that maps to no known issue', async () => {
    await run({
      worktrees: [`${WT}/feature/99`, `${WT}/odd/name`, '/elsewhere/feature/7'],
      closed: ['7'],
    });
    expect(removed(runner)).toEqual([]);
  });

  it('never removes the main checkout', async () => {
    await run({ worktrees: [], closed: ['7'] });
    expect(removed(runner)).toEqual([]);
  });

  it('logs a failed removal, keeps going and does not throw', async () => {
    await run({
      worktrees: [`${WT}/feature/7`, `${WT}/feature/8`],
      closed: ['7', '8'],
      failRemove: `${WT}/feature/7`,
    });
    expect(removed(runner)).toHaveLength(2);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it('logs a failed listing and does not throw', async () => {
    runner.on(['git', 'worktree', 'list'], { code: 128, stderr: 'not a repo' });
    await expect(
      pruneWorktrees({
        runner,
        tracker: new FakeTracker({ tracker: 'github', viewer: null, issues: [] }),
        repo: repo(),
        sky: sky({}),
        live: [],
      }),
    ).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledTimes(1);
  });
});

describe('pruneWorktrees around a live System', () => {
  it('keeps the closed tickets of a System whose Session is live', async () => {
    runner.on(['git', 'worktree', 'remove'], {});
    runner.on(['git', 'worktree', 'list'], {
      stdout: list(`${WT}/feature/5`, `${WT}/feature/7`, `${WT}/feature/8`),
    });
    const tracker = new FakeTracker({
      tracker: 'github',
      viewer: null,
      issues: [
        rawIssue('5', { childIds: ['7', '8'] }),
        rawIssue('7', { state: 'closed', parentId: '5' }),
        rawIssue('8', { state: 'closed' }),
      ],
    });
    await pruneWorktrees({
      runner,
      tracker,
      repo: repo(),
      sky: sky({ systems: [system('5')], embers: [ember('7')] }),
      live: [{ kind: 'system', id: '5' }],
    });
    expect(removed(runner)).toEqual([]);
  });

  it('still removes a closed ticket of a System with no live Session', async () => {
    await run({
      worktrees: [`${WT}/feature/7`],
      closed: ['7'],
      fixture: { systems: [system('5')] },
      live: [{ kind: 'system', id: '6' }],
    });
    expect(removed(runner)).toEqual([`git worktree remove --force ${WT}/feature/7`]);
  });

  it('keeps a slug that an open ticket also has', async () => {
    await run({
      worktrees: [`${WT}/feature/7`],
      fixture: { tickets: [ticket('7')], embers: [ember('7')] },
    });
    expect(removed(runner)).toEqual([]);
  });
});
