import { describe, expect, it } from 'vitest';
import { FakeFs } from '#server/testing/fake-fs.ts';
import type { Launch } from './identity.ts';
import { fileLaunchStore, launchesPath } from './launch-store.ts';

const path = launchesPath('/Users/dev');
const launch: Launch = {
  repo: '/code/app',
  target: { kind: 'ticket', id: '42' },
  cwd: '/code/app.worktrees/feature/42',
  terminal: 'w0t1p0:ABC',
};

describe('launch store', () => {
  it('lives beside the board config', () => {
    expect(path).toBe('/Users/dev/.config/ui-agent-workflow/launches.json');
  });

  it('loads what it saved', async () => {
    const fs = new FakeFs();
    const saved = [launch, { ...launch, terminal: null }];
    await fileLaunchStore(fs, path).save(saved);
    expect(await fileLaunchStore(fs, path).load()).toEqual(saved);
  });

  it('loads a missing file as no launches', async () => {
    expect(await fileLaunchStore(new FakeFs(), path).load()).toEqual([]);
  });

  it('loads a broken file as no launches and skips malformed records', async () => {
    expect(await fileLaunchStore(new FakeFs({ [path]: '{oops' }), path).load()).toEqual([]);
    const fs = new FakeFs({
      [path]: JSON.stringify([launch, { repo: '/x' }, { ...launch, target: { kind: 'ticket' } }]),
    });
    expect(await fileLaunchStore(fs, path).load()).toEqual([launch]);
  });
});
