import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CommandRunner } from '#server/core/runner.ts';
import { withDefaults } from '#server/config/store.ts';
import { checkBaseLines } from '#server/gaps/base-lines.ts';
import type { Deps } from '#server/http/types.ts';
import { prepareStart } from '#server/launch/prepare.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { readSky } from './read.ts';
import { linked } from '#server/testing/fake-link.ts';

const stdout = readFileSync(new URL('./fixtures/harbor-graphql.json', import.meta.url), 'utf8');
const START = new Date('2026-09-25T20:00:00Z').getTime();

/** Each test uses its own repo path so the module-level cache can't leak across tests. */
function repoAt(path: string) {
  return withDefaults({ path, owner: 'ana-reyes', name: 'harbor' });
}

function deps(runner: CommandRunner, path: string, now: () => Date = () => new Date(START)): Deps {
  const fs = new FakeFs({ [`${path}/docs/agents/issue-tracker.md`]: '# Issue tracker: GitHub\n' });
  return { runner, fs, home: '/home/me', now, ...linked() };
}

describe('readSky', () => {
  it('runs one query for two concurrent reads of a repo', async () => {
    const repo = repoAt('/code/harbor-concurrent');
    const runner = new FakeRunner().on(['gh', 'api', 'graphql'], { stdout });
    const [first, second] = await Promise.all([
      readSky(deps(runner, repo.path), repo),
      readSky(deps(runner, repo.path), repo),
    ]);
    expect(runner.calls).toHaveLength(1);
    expect(second).toBe(first);
    expect(first.readAt).toBe('2026-09-25T20:00:00.000Z');
    expect(first.sky.mapId).toBe('512');
  });

  it('reads again once the shared read has settled, even after a failure', async () => {
    const repo = repoAt('/code/harbor-retry');
    const runner = new FakeRunner()
      .on(['gh', 'api', 'graphql'], { stdout })
      .on(['gh', 'api', 'graphql'], { code: 1, stderr: 'rate limited' }, 1);
    await expect(readSky(deps(runner, repo.path), repo)).rejects.toThrow('rate limited');
    await readSky(deps(runner, repo.path), repo);
    expect(runner.calls).toHaveLength(2);
  });

  it('starts a fresh read beside a running one, and later reads join the fresh one', async () => {
    const repo = repoAt('/code/harbor-fresh-beside');
    const fake = new FakeRunner().on(['gh', 'api', 'graphql'], { stdout });
    let open = () => {};
    const gate = new Promise<void>((resolve) => (open = resolve));
    const runner: CommandRunner = {
      run: async (command, args, options) => {
        if (fake.calls.length === 1) await gate;
        return fake.run(command, args, options);
      },
    };
    const stale = readSky(deps(runner, repo.path), repo);
    const fresh = readSky(deps(runner, repo.path), repo, { fresh: true });
    await stale;
    const joined = readSky(deps(runner, repo.path), repo);
    open();
    expect(await joined).toBe(await fresh);
    expect(await fresh).not.toBe(await stale);
    expect(fake.calls).toHaveLength(2);
  });

  it('serves a non-fresh read from the cache inside the TTL, with no Tracker read', async () => {
    const repo = repoAt('/code/harbor-cache-hit');
    const runner = new FakeRunner().on(['gh', 'api', 'graphql'], { stdout });
    let now = START;
    const d = deps(runner, repo.path, () => new Date(now));
    await readSky(d, repo);
    now += 60_000;
    await readSky(d, repo);
    expect(runner.calls).toHaveLength(1);
  });

  it('reads again once the TTL has passed', async () => {
    const repo = repoAt('/code/harbor-cache-expired');
    const runner = new FakeRunner().on(['gh', 'api', 'graphql'], { stdout });
    let now = START;
    const d = deps(runner, repo.path, () => new Date(now));
    await readSky(d, repo);
    now += 2 * 60_000 + 1;
    await readSky(d, repo);
    expect(runner.calls).toHaveLength(2);
  });

  it('fresh always reads and replaces the cached entry', async () => {
    const repo = repoAt('/code/harbor-cache-fresh');
    const runner = new FakeRunner().on(['gh', 'api', 'graphql'], { stdout });
    const d = deps(runner, repo.path);
    await readSky(d, repo);
    await readSky(d, repo, { fresh: true });
    expect(runner.calls).toHaveLength(2);
  });

  it('does not cache a failed read', async () => {
    const repo = repoAt('/code/harbor-cache-fail');
    const runner = new FakeRunner()
      .on(['gh', 'api', 'graphql'], { stdout })
      .on(['gh', 'api', 'graphql'], { code: 1, stderr: 'rate limited' }, 1);
    const d = deps(runner, repo.path);
    await expect(readSky(d, repo)).rejects.toThrow('rate limited');
    await readSky(d, repo);
    expect(runner.calls).toHaveLength(2);
  });

  it('costs one Tracker read for a Sky, Gap and Start-plan read within the TTL', async () => {
    const repo = repoAt('/code/harbor-shared-callers');
    const runner = new FakeRunner()
      .on(['gh', 'api', 'graphql'], { stdout })
      .on(['git', 'ls-remote'], { stdout: 'ref: refs/heads/main\tHEAD' });
    const d = deps(runner, repo.path);
    await readSky(d, repo);
    await checkBaseLines(d, repo);
    await prepareStart(d, repo, { kind: 'map', id: '512' }, null);
    expect(runner.calls.filter((c) => c.command === 'gh')).toHaveLength(1);
  });
});
