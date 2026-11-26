import { describe, expect, it, vi } from 'vitest';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { trustWorktree } from './trust.ts';

const FILE = '/home/node/.claude.json';

describe('trustWorktree', () => {
  it('creates the file when missing', async () => {
    const fs = new FakeFs({ '/home/node/x': '' });
    await trustWorktree(fs, FILE, '/wt/a');
    expect(JSON.parse(fs.files.get(FILE)!)).toEqual({
      projects: { '/wt/a': { hasTrustDialogAccepted: true } },
    });
  });

  it('keeps every other key', async () => {
    const fs = new FakeFs({
      [FILE]: JSON.stringify({
        theme: 'dark',
        projects: {
          '/wt/a': { allowedTools: ['x'], hasTrustDialogAccepted: false },
          '/o': { k: 1 },
        },
      }),
    });
    await trustWorktree(fs, FILE, '/wt/a');
    expect(JSON.parse(fs.files.get(FILE)!)).toEqual({
      theme: 'dark',
      projects: { '/wt/a': { allowedTools: ['x'], hasTrustDialogAccepted: true }, '/o': { k: 1 } },
    });
  });

  it('writes a temp file next to it and renames it into place', async () => {
    const fs = new FakeFs({ [FILE]: '{}' });
    const renames: [string, string][] = [];
    const rename = fs.rename.bind(fs);
    fs.rename = (from, to) => {
      renames.push([from, to]);
      return rename(from, to);
    };
    await trustWorktree(fs, FILE, '/wt/a');
    expect(renames).toHaveLength(1);
    expect(renames[0]![0]).toMatch(/^\/home\/node\/\.claude\.json\..+\.tmp$/);
    expect(renames[0]![1]).toBe(FILE);
    expect([...fs.files.keys()]).toEqual([FILE]);
  });

  it('reads again once when Claude is halfway through writing the file', async () => {
    const fs = new FakeFs({ [FILE]: '{"theme": "da' });
    const read = fs.read.bind(fs);
    let reads = 0;
    fs.read = async (path) => {
      reads += 1;
      if (reads === 2) fs.files.set(FILE, '{"theme": "dark"}');
      return read(path);
    };
    await trustWorktree(fs, FILE, '/wt/a');
    expect(JSON.parse(fs.files.get(FILE)!)).toEqual({
      theme: 'dark',
      projects: { '/wt/a': { hasTrustDialogAccepted: true } },
    });
  });

  it('leaves a file that stays broken as it is, logs, and does not throw', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fs = new FakeFs({ [FILE]: '{"theme": "da' });
    await expect(trustWorktree(fs, FILE, '/wt/a')).resolves.toBeUndefined();
    expect(fs.files.get(FILE)).toBe('{"theme": "da');
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });
});
