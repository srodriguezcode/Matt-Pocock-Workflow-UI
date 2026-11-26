import { describe, expect, it } from 'vitest';
import { configPath } from '#server/config/store.ts';
import type { Deps } from '#server/http/types.ts';
import { linked } from '#server/testing/fake-link.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { ciHooks, ROOT } from '#server/tracker/scratch/fixtures.ts';
import { identifyByCwd } from './rebuild.ts';

const HOME = '/home/me';
const WORKTREES = `${ROOT}.worktrees`;

function deps(files: Record<string, string>): Deps {
  const config = { repos: [{ path: ROOT, owner: 'me', name: 'app' }] };
  const fs = new FakeFs({
    [configPath(HOME)]: JSON.stringify(config),
    [`${ROOT}/docs/agents/issue-tracker.md`]: '# Issue tracker: Local markdown\n',
    ...files,
  });
  return {
    runner: new FakeRunner(),
    fs,
    home: HOME,
    now: () => new Date('2026-09-30T10:00:00Z'),
    ...linked(),
  };
}

describe('identifyByCwd', () => {
  it("links a Session in a ticket's worktree to that ticket", async () => {
    expect(await identifyByCwd(deps(ciHooks), `${WORKTREES}/feature/ci-hooks-02`)).toEqual({
      repo: ROOT,
      target: { kind: 'ticket', id: 'ci-hooks/02' },
    });
  });

  it("links a Session in a System's worktree to the System, from deeper inside it", async () => {
    expect(await identifyByCwd(deps(ciHooks), `${WORKTREES}/bugfix/ci-hooks/server`)).toEqual({
      repo: ROOT,
      target: { kind: 'system', id: 'ci-hooks' },
    });
  });

  it('leaves the main checkout, an unknown slug and a foreign path unlinked', async () => {
    const board = deps(ciHooks);
    expect(await identifyByCwd(board, ROOT)).toBeNull();
    expect(await identifyByCwd(board, `${WORKTREES}/feature/ci-hooks-99`)).toBeNull();
    expect(await identifyByCwd(board, `${WORKTREES}/spike/ci-hooks-02`)).toBeNull();
    expect(await identifyByCwd(board, '/tmp/ci-hooks-02')).toBeNull();
  });

  it('is null when the repo declares no Tracker the board reads', async () => {
    const board = deps({ ...ciHooks, [`${ROOT}/docs/agents/issue-tracker.md`]: '# Notes\n' });
    expect(await identifyByCwd(board, `${WORKTREES}/feature/ci-hooks-02`)).toBeNull();
  });
});
