import { describe, expect, it } from 'vitest';
import type { Config, RepoConfig } from '@contract/repo';
import { configPath, readConfig, writeConfig } from '#server/config/store.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { editRepo, planEditRepo, removeRepo, reorderRepos } from './edit.ts';

const home = '/Users/dev';

const app: RepoConfig = {
  path: '/code/app',
  owner: 'me',
  name: 'app',
  branchPrefixes: [{ label: 'bug', prefix: 'bugfix' }],
  fallbackPrefix: 'feature',
  labels: {},
  tile: { letters: 'AP' },
};
const lib: RepoConfig = { ...app, path: '/code/lib', name: 'lib', tile: { letters: 'LI' } };
const config: Config = { repos: [app, lib], theme: 'light' };

function refusal(body: unknown) {
  try {
    planEditRepo(config, body);
  } catch (error) {
    return (error as { status: number; reason?: unknown }).reason ?? 'no code';
  }
  return 'accepted';
}

describe('planEditRepo', () => {
  it('replaces the entry in place with every editable field', () => {
    const edited: RepoConfig = {
      ...app,
      baseBranch: 'release/2.x',
      branchPrefixes: [
        { label: 'docs', prefix: 'docs' },
        { label: 'bug', prefix: 'fix' },
      ],
      fallbackPrefix: 'feat',
      worktreeDir: '../trees',
      labels: { 'ready-for-agent': 'agent-ok', 'wayfinder:': 'wf:' },
      tile: { image: 'data:image/png;base64,x' },
    };
    const { config: next, repo } = planEditRepo(config, edited);
    expect(repo).toEqual(edited);
    expect(next.repos).toEqual([edited, lib]);
  });

  it('drops fields a RepoConfig does not have', () => {
    const { repo } = planEditRepo(config, { ...app, extra: 1 });
    expect(repo).toEqual(app);
  });

  it('refuses an unknown path, and an owner or name that differs from the saved one', () => {
    expect(refusal({ ...app, path: '/code/other' })).toEqual({
      code: 'unknown-repo',
      path: '/code/other',
    });
    expect(refusal({ ...app, owner: 'you' })).toEqual({
      code: 'fixed-identity',
      path: '/code/app',
    });
    expect(refusal({ ...app, name: 'lib' })).toEqual({ code: 'fixed-identity', path: '/code/app' });
  });

  it('checks the tile as Add does', () => {
    expect(refusal({ ...app, tile: { letters: 'ABC' } })).toEqual({ code: 'bad-tile' });
    expect(refusal({ ...app, tile: { image: 'https://x/y.png' } })).toEqual({ code: 'bad-tile' });
  });

  it('refuses a base branch git would not take', () => {
    for (const branch of ['', 'a..b', 'main/', 'has space', 'x.lock']) {
      expect(refusal({ ...app, baseBranch: branch })).toEqual({ code: 'bad-base-branch', branch });
    }
    expect(refusal({ ...app, baseBranch: 'release/2.x' })).toBe('accepted');
  });

  it('refuses a prefix without a label and a prefix that is not one ref component', () => {
    expect(refusal({ ...app, branchPrefixes: [{ label: ' ', prefix: 'x' }] })).toEqual({
      code: 'blank-prefix-label',
    });
    for (const prefix of ['', 'a/b', '.hidden', 'a~b']) {
      expect(refusal({ ...app, branchPrefixes: [{ label: 'bug', prefix }] })).toEqual({
        code: 'bad-branch-prefix',
        prefix,
      });
      expect(refusal({ ...app, fallbackPrefix: prefix })).toEqual({
        code: 'bad-branch-prefix',
        prefix,
      });
    }
  });

  it('refuses a blank worktree folder', () => {
    expect(refusal({ ...app, worktreeDir: ' ' })).toEqual({ code: 'bad-worktree-dir' });
    expect(refusal({ ...app, worktreeDir: 4 })).toEqual({ code: 'bad-worktree-dir' });
  });

  it('takes remap keys only from the canonical labels, each with a name', () => {
    expect(refusal({ ...app, labels: { bug: 'defect' } })).toEqual({
      code: 'unknown-label',
      label: 'bug',
    });
    expect(refusal({ ...app, labels: { spec: '' } })).toEqual({
      code: 'blank-label-remap',
      label: 'spec',
    });
  });
});

describe('editRepo', () => {
  it('writes the edited entry to the config file and keeps the theme', async () => {
    const fs = new FakeFs();
    await writeConfig(fs, home, config);
    const repo = await editRepo({ fs, home }, { ...app, baseBranch: 'develop' });
    expect(repo.baseBranch).toBe('develop');
    expect(await readConfig(fs, home)).toEqual({ repos: [repo, lib], theme: 'light' });
  });
});

describe('removeRepo', () => {
  it('drops only the entry and returns the repos left', async () => {
    const fs = new FakeFs();
    await writeConfig(fs, home, config);
    expect(await removeRepo({ fs, home }, '/code/app')).toEqual([lib]);
    expect(await readConfig(fs, home)).toEqual({ repos: [lib], theme: 'light' });
  });

  it('refuses a path not in the config', async () => {
    const fs = new FakeFs();
    await writeConfig(fs, home, config);
    await expect(removeRepo({ fs, home }, '/code/gone')).rejects.toMatchObject({
      status: 404,
      reason: { code: 'unknown-repo', path: '/code/gone' },
    });
  });
});

describe('reorderRepos', () => {
  const docs: RepoConfig = { ...app, path: '/code/docs', name: 'docs', tile: { letters: 'DO' } };
  const three: Config = { repos: [app, lib, docs], theme: 'light' };

  it('writes the repos in the order given and returns them', async () => {
    const fs = new FakeFs();
    await writeConfig(fs, home, three);
    const paths = ['/code/docs', '/code/app', '/code/lib'];
    expect(await reorderRepos({ fs, home }, { paths })).toEqual([docs, app, lib]);
    expect(await readConfig(fs, home)).toEqual({ repos: [docs, app, lib], theme: 'light' });
  });

  it('refuses a missing, extra or duplicate path and leaves the config file as it was', async () => {
    const fs = new FakeFs();
    await writeConfig(fs, home, three);
    const before = fs.files.get(configPath(home));
    for (const paths of [
      ['/code/docs', '/code/app'],
      ['/code/docs', '/code/app', '/code/lib', '/code/new'],
      ['/code/docs', '/code/app', '/code/app'],
      ['/code/docs', '/code/app', '/code/new'],
    ]) {
      await expect(reorderRepos({ fs, home }, { paths })).rejects.toMatchObject({
        status: 400,
        reason: { code: 'bad-repo-order' },
      });
    }
    await expect(reorderRepos({ fs, home }, { paths: 'x' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(reorderRepos({ fs, home }, null)).rejects.toMatchObject({ status: 400 });
    expect(fs.files.get(configPath(home))).toBe(before);
  });
});
