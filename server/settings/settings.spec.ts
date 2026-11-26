import { describe, expect, it } from 'vitest';
import { configPath, readConfig, writeConfig } from '#server/config/store.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { readSettings, writeSettings } from './settings.ts';

const home = '/Users/dev';
const repo = {
  path: '/code/app',
  owner: 'me',
  name: 'app',
  branchPrefixes: [],
  fallbackPrefix: 'feature',
  labels: {},
  tile: { letters: 'AP' },
};

describe('settings', () => {
  it('reads a missing theme as dark', async () => {
    expect(await readSettings({ fs: new FakeFs(), home })).toEqual({ theme: 'dark' });
    const fs = new FakeFs({ [configPath(home)]: JSON.stringify({ repos: [] }) });
    expect(await readSettings({ fs, home })).toEqual({ theme: 'dark' });
  });

  it('reads back a written theme and leaves the repos alone', async () => {
    const fs = new FakeFs();
    await writeConfig(fs, home, { repos: [repo], theme: 'dark' });
    expect(await writeSettings({ fs, home }, { theme: 'light' })).toEqual({ theme: 'light' });
    expect(await readSettings({ fs, home })).toEqual({ theme: 'light' });
    expect((await readConfig(fs, home)).repos).toEqual([repo]);
  });

  it('refuses a theme other than dark or light', async () => {
    const fs = new FakeFs();
    for (const body of [{ theme: 'sepia' }, { theme: null }, {}, null]) {
      await expect(writeSettings({ fs, home }, body)).rejects.toMatchObject({
        status: 400,
        reason: { code: 'bad-theme' },
      });
    }
    expect(fs.files.size).toBe(0);
  });

  it('reads an unknown theme on disk as dark', async () => {
    const fs = new FakeFs({ [configPath(home)]: JSON.stringify({ repos: [], theme: 'sepia' }) });
    expect(await readSettings({ fs, home })).toEqual({ theme: 'dark' });
  });
});
