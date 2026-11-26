import { describe, expect, it } from 'vitest';
import type { AddRepoRequest } from '@contract/api';
import { configPath } from '#server/config/store.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { addRepo, checkoutRepo, planAddRepo } from './add.ts';

const home = '/Users/dev';

function runner(): FakeRunner {
  return new FakeRunner()
    .on(['git', '-C', '/code/app', 'rev-parse', '--show-toplevel'], { stdout: '/code/app\n' })
    .on(['git', '-C', '/code/app', 'remote', 'get-url', 'origin'], {
      stdout: 'git@github.com:me/app.git\n',
    });
}

describe('checkoutRepo', () => {
  it('reads the toplevel and owner/repo from a GitHub origin', async () => {
    expect(await checkoutRepo(runner(), '/code/app')).toEqual({
      path: '/code/app',
      owner: 'me',
      name: 'app',
    });
  });

  it('refuses a path that is not a git checkout', async () => {
    const bad = new FakeRunner().on(['git', '-C', '/code/nope', 'rev-parse', '--show-toplevel'], {
      code: 128,
      stderr: 'not a git repository',
    });
    await expect(checkoutRepo(bad, '/code/nope')).rejects.toMatchObject({
      reason: { code: 'not-a-checkout', path: '/code/nope' },
    });
  });

  it('refuses a checkout whose origin is not on GitHub', async () => {
    const bad = new FakeRunner()
      .on(['git', '-C', '/code/app', 'rev-parse', '--show-toplevel'], { stdout: '/code/app\n' })
      .on(['git', '-C', '/code/app', 'remote', 'get-url', 'origin'], {
        stdout: 'git@gitlab.com:me/app.git\n',
      });
    await expect(checkoutRepo(bad, '/code/app')).rejects.toMatchObject({
      reason: { code: 'origin-not-github' },
    });
  });
});

describe('planAddRepo', () => {
  const checkout = { path: '/code/app', owner: 'me', name: 'app' };

  it('appends a repo with tile letters from the name and keeps the theme', () => {
    const { repo, config } = planAddRepo({ repos: [], theme: 'light' }, checkout, {
      path: checkout.path,
    });
    expect(repo).toMatchObject({
      path: '/code/app',
      owner: 'me',
      name: 'app',
      tile: { letters: 'AP' },
    });
    expect(config).toEqual({ repos: [repo], theme: 'light' });
  });

  it('takes the tile from the request when given', () => {
    const { repo } = planAddRepo({ repos: [], theme: 'dark' }, checkout, {
      path: checkout.path,
      tile: { image: 'data:image/png;base64,x' },
    });
    expect(repo.tile).toEqual({ image: 'data:image/png;base64,x' });
  });

  it('refuses a tile that is neither 1–2 letters nor an image data URL', () => {
    const add = (tile: unknown) =>
      planAddRepo({ repos: [], theme: 'dark' }, checkout, {
        path: checkout.path,
        tile,
      } as AddRepoRequest);
    for (const tile of [
      { letters: '' },
      { letters: 'ABC' },
      { image: 'https://x/y.png' },
      {},
      'AP',
    ]) {
      expect(() => add(tile)).toThrow(expect.objectContaining({ reason: { code: 'bad-tile' } }));
    }
    expect(add({ letters: 'A' }).repo.tile).toEqual({ letters: 'A' });
  });

  it('refuses a checkout path already in the config', () => {
    const existing = {
      repos: [
        {
          ...checkout,
          branchPrefixes: [],
          fallbackPrefix: 'feature',
          labels: {},
          tile: { letters: 'AP' },
        },
      ],
      theme: 'dark' as const,
    };
    expect(() => planAddRepo(existing, checkout, { path: checkout.path })).toThrow(
      expect.objectContaining({ reason: { code: 'already-added', path: '/code/app' } }),
    );
  });
});

describe('addRepo', () => {
  it('creates the config file and directory on the first Add', async () => {
    const fs = new FakeFs();
    const repo = await addRepo(
      { runner: runner(), fs, home, runtime: 'mac' as const },
      { path: '/code/app' },
    );
    expect(repo).toMatchObject({ path: '/code/app', owner: 'me', name: 'app' });
    const written = JSON.parse(fs.files.get(configPath(home))!);
    expect(written.repos).toHaveLength(1);
  });

  it('refuses a duplicate add', async () => {
    const fs = new FakeFs();
    const deps = { runner: runner(), fs, home, runtime: 'mac' as const };
    await addRepo(deps, { path: '/code/app' });
    await expect(
      addRepo({ ...deps, runner: runner() }, { path: '/code/app' }),
    ).rejects.toMatchObject({ reason: { code: 'already-added', path: '/code/app' } });
  });

  describe('by owner/name', () => {
    const dir = '/repos/me/app';
    const piRunner = () =>
      new FakeRunner()
        .on(['gh', 'repo', 'clone', 'me/app', dir], {})
        .on(['git', '-C', dir, 'rev-parse', '--show-toplevel'], { stdout: `${dir}\n` })
        .on(['git', '-C', dir, 'rev-parse', '--show-toplevel'], { code: 128 }, 1)
        .on(['git', '-C', dir, 'remote', 'get-url', 'origin'], {
          stdout: 'https://github.com/me/app.git\n',
        });

    it('clones into /repos and adds the repo in the container runtime', async () => {
      const fs = new FakeFs();
      const run = piRunner();
      const repo = await addRepo(
        { runner: run, fs, home, runtime: 'container' },
        { github: 'me/app' },
      );
      expect(repo).toMatchObject({ path: dir, owner: 'me', name: 'app' });
      expect(run.lines()).toContain(`gh repo clone me/app ${dir} -- --filter=blob:none`);
      expect(JSON.parse(fs.files.get(configPath(home))!).repos).toHaveLength(1);
    });

    it('reuses an existing clone', async () => {
      const run = piRunner();
      run.on(['git', '-C', dir, 'rev-parse', '--show-toplevel'], { stdout: `${dir}\n` });
      await addRepo(
        { runner: run, fs: new FakeFs(), home, runtime: 'container' },
        { github: 'me/app' },
      );
      expect(run.lines().some((line) => line.startsWith('gh '))).toBe(false);
    });

    it('returns not-a-repo and adds nothing when the clone fails', async () => {
      const fs = new FakeFs();
      const run = new FakeRunner()
        .on(['git'], { code: 128 })
        .on(['gh', 'repo', 'clone'], { code: 1, stderr: 'not found' });
      await expect(
        addRepo({ runner: run, fs, home, runtime: 'container' }, { github: 'me/nope' }),
      ).rejects.toMatchObject({ status: 400, reason: { code: 'not-a-repo', repo: 'me/nope' } });
      expect(fs.files.has(configPath(home))).toBe(false);
    });

    it('returns not-a-repo for a malformed name without running anything', async () => {
      const run = new FakeRunner();
      for (const github of ['app', 'me/app/x', '../etc', 'me/..', '-me/app', 'me/-x'])
        await expect(
          addRepo({ runner: run, fs: new FakeFs(), home, runtime: 'container' }, { github }),
        ).rejects.toMatchObject({ reason: { code: 'not-a-repo' } });
      expect(run.calls).toEqual([]);
    });

    it('refuses an owner/name body on the Mac runtime', async () => {
      await expect(
        addRepo(
          { runner: new FakeRunner(), fs: new FakeFs(), home, runtime: 'mac' },
          {
            github: 'me/app',
          },
        ),
      ).rejects.toMatchObject({ status: 400, reason: { code: 'by-name-needs-container' } });
    });

    it('clones a mixed-case name into the lowercase folder', async () => {
      const run = piRunner();
      const repo = await addRepo(
        { runner: run, fs: new FakeFs(), home, runtime: 'container' },
        { github: 'Me/App' },
      );
      expect(repo.path).toBe(dir);
      expect(run.lines()).toContain(`gh repo clone me/app ${dir} -- --filter=blob:none`);
    });
  });
});
