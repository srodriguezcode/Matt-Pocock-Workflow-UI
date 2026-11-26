import { describe, expect, it } from 'vitest';
import { FakeFs } from '#server/testing/fake-fs.ts';
import {
  configPath,
  readConfig,
  tileLetters,
  worktreeDir,
  writeConfig,
  withDefaults,
} from './store.ts';

const home = '/Users/dev';

describe('config store', () => {
  it('reads a missing file as no repos', async () => {
    expect(await readConfig(new FakeFs(), home)).toEqual({ repos: [], theme: 'dark' });
  });

  it('reads repos from the per-machine file and fills defaults', async () => {
    const fs = new FakeFs({
      [configPath(home)]: JSON.stringify({
        repos: [{ path: '/code/app', owner: 'me', name: 'app', baseBranch: 'develop' }],
      }),
    });
    const [repo] = (await readConfig(fs, home)).repos;
    expect(repo).toMatchObject({
      path: '/code/app',
      baseBranch: 'develop',
      branchPrefixes: [{ label: 'bug', prefix: 'bugfix' }],
      fallbackPrefix: 'feature',
      tile: { letters: 'AP' },
    });
  });

  it('creates the directory on first write', async () => {
    const fs = new FakeFs();
    await writeConfig(fs, home, { repos: [], theme: 'dark' });
    expect(fs.files.get(`${home}/.config/ui-agent-workflow/config.json`)).toBe(
      '{\n  "repos": [],\n  "theme": "dark"\n}\n',
    );
  });

  it('derives tile letters from the repo name', () => {
    expect(tileLetters('ui-agent-workflow')).toBe('UA');
    expect(tileLetters('Harbor')).toBe('HA');
    expect(tileLetters('-foo')).toBe('FO');
  });

  it('puts worktrees beside the checkout unless overridden', () => {
    const repo = withDefaults({ path: '/code/app', owner: 'me', name: 'app' });
    expect(worktreeDir(repo)).toBe('/code/app.worktrees');
    expect(worktreeDir({ ...repo, worktreeDir: '../trees' })).toBe('/code/trees');
    expect(worktreeDir({ ...repo, worktreeDir: '/abs/trees' })).toBe('/abs/trees');
  });
});
