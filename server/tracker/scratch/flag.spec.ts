import { describe, expect, it } from 'vitest';
import { withDefaults } from '#server/config/store.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { scratchTracker } from './adapter.ts';
import { mixed, ROOT, SCRATCH } from './fixtures.ts';

const repo = withDefaults({ path: ROOT, owner: 'me', name: 'app' });
const CSV = `${SCRATCH}/export/issues/01-csv.md`;
const DECISION = `${SCRATCH}/route/issues/02-tile-cache.md`;
const MAP = `${SCRATCH}/route/map.md`;
const SPEC = `${SCRATCH}/export/spec.md`;

function world(files: Record<string, string>) {
  const fs = new FakeFs(files);
  const runner = new FakeRunner();
  return { fs, runner, tracker: scratchTracker(fs, runner, repo) };
}

async function flagged(files: Record<string, string>, id: string) {
  const graph = await world(files).tracker.read();
  return graph.issues.find((issue) => issue.id === id)?.flagged;
}

describe('Flagged on read', () => {
  it('reads a Flagged: yes line in any letter case', async () => {
    for (const value of ['yes', 'Yes', 'YES']) {
      const files = { [CSV]: `# 01 — CSV export\n\nStatus: ready-for-agent\nFlagged: ${value}\n` };
      expect(await flagged(files, 'export/01')).toBe(true);
    }
  });

  it('reads any other value, or no line, as not flagged', async () => {
    for (const value of ['no', 'true', '', 'yes please']) {
      const files = { [CSV]: `# 01 — CSV export\n\nFlagged: ${value}\n` };
      expect(await flagged(files, 'export/01')).toBe(false);
    }
    expect(await flagged(mixed, 'export/01')).toBe(false);
  });

  it('reads the line on a System main file, map or spec', async () => {
    const files = {
      ...mixed,
      [MAP]: mixed[MAP]!.replace('# Route planner\n', '# Route planner\nFlagged: yes\n'),
      [SPEC]: '# Spec: Export\nFlagged: Yes\n\nExport a trip as a file.\n',
    };
    expect(await flagged(files, 'route')).toBe(true);
    expect(await flagged(files, 'export')).toBe(true);
    expect(await flagged(files, 'cleanup')).toBe(false);
  });

  it('ignores a Flagged line quoted in a section', async () => {
    const files = { [CSV]: '# 01 — CSV\n\n## Notes\n\nFlagged: yes\n' };
    expect(await flagged(files, 'export/01')).toBe(false);
  });
});

describe('Flag and Unflag', () => {
  it('adds the line under the Status line', async () => {
    const { fs, tracker } = world(mixed);
    await tracker.flag('export/01', true);
    expect(fs.files.get(CSV)).toBe('# 01 — CSV export\n\nStatus: ready-for-agent\nFlagged: yes\n');
  });

  it('adds the line under the title when there is no Status', async () => {
    const { fs, tracker } = world(mixed);
    await tracker.flag('route/02', true);
    expect(fs.files.get(DECISION)).toBe(
      mixed[DECISION]!.replace('# 02 — How big is the tile cache\n', '$&Flagged: yes\n'),
    );
  });

  it('follows a bold header style', async () => {
    const path = `${SCRATCH}/w/issues/01-bold.md`;
    const { fs, tracker } = world({ [path]: '# 01 — Bold\n\n**Status:** ready-for-agent\n' });
    await tracker.flag('w/01', true);
    expect(fs.files.get(path)).toBe(
      '# 01 — Bold\n\n**Status:** ready-for-agent\n**Flagged:** yes\n',
    );
    await tracker.flag('w/01', false);
    expect(fs.files.get(path)).toBe('# 01 — Bold\n\n**Status:** ready-for-agent\n');
  });

  it('removes the line on Unflag, restoring the file byte for byte', async () => {
    const { fs, tracker } = world(mixed);
    await tracker.flag('export/01', true);
    await tracker.flag('export/01', false);
    expect(fs.files.get(CSV)).toBe(mixed[CSV]);
    await tracker.flag('route/02', true);
    await tracker.flag('route/02', false);
    expect(fs.files.get(DECISION)).toBe(mixed[DECISION]);
  });

  it('leaves one line when flagged twice', async () => {
    const { fs, tracker } = world(mixed);
    await tracker.flag('export/01', true);
    await tracker.flag('export/01', true);
    expect(fs.files.get(CSV)).toBe('# 01 — CSV export\n\nStatus: ready-for-agent\nFlagged: yes\n');
  });

  it('turns any other value into yes without a second line', async () => {
    const { fs, tracker } = world({ [CSV]: '# 01 — CSV\n\nFlagged: no\nStatus: claimed\n' });
    await tracker.flag('export/01', true);
    expect(fs.files.get(CSV)).toBe('# 01 — CSV\n\nFlagged: yes\nStatus: claimed\n');
  });

  it('leaves an unflagged ticket untouched on Unflag', async () => {
    const { fs, tracker } = world(mixed);
    await tracker.flag('export/01', false);
    expect(fs.files.get(CSV)).toBe(mixed[CSV]);
  });

  it('shows up on the next read', async () => {
    const { tracker } = world(mixed);
    await tracker.flag('export/01', true);
    const issues = (await tracker.read()).issues;
    expect(issues.find((i) => i.id === 'export/01')?.flagged).toBe(true);
    expect(issues.find((i) => i.id === 'export/02')?.flagged).toBe(false);
  });

  it('writes a System flag into its map.md or spec.md', async () => {
    const { fs, tracker } = world(mixed);
    await tracker.flag('route', true);
    await tracker.flag('export', true);
    expect(fs.files.get(MAP)).toBe(mixed[MAP]!.replace('# Route planner\n', '$&Flagged: yes\n'));
    expect(fs.files.get(SPEC)).toBe('# Spec: Export\nFlagged: yes\n\nExport a trip as a file.\n');
    await tracker.flag('route', false);
    await tracker.flag('export', false);
    expect(fs.files.get(MAP)).toBe(mixed[MAP]);
    expect(fs.files.get(SPEC)).toBe(mixed[SPEC]);
    expect(
      [...fs.files.keys()].filter((p) => p.endsWith('/issues/01-pick-provider.md')),
    ).toHaveLength(1);
  });

  it('refuses to flag a plain effort with no map or spec', async () => {
    const { fs, tracker } = world(mixed);
    await expect(tracker.flag('cleanup', true)).rejects.toThrow();
    expect(
      [...fs.files.keys()].some(
        (p) => p.startsWith(`${SCRATCH}/cleanup/`) && !p.includes('/issues/'),
      ),
    ).toBe(false);
  });

  it('runs no command', async () => {
    const { runner, tracker } = world(mixed);
    await tracker.flag('export/01', true);
    await tracker.flag('route', true);
    await tracker.flag('export/01', false);
    expect(runner.calls).toEqual([]);
  });
});

describe('flagCommand', () => {
  it('shows the added and the dropped line on the ticket file', async () => {
    const { tracker } = world(mixed);
    await tracker.read();
    expect(tracker.flagCommand('export/01', true)).toBe(`${CSV}: + Flagged: yes`);
    expect(tracker.flagCommand('export/01', false)).toBe(`${CSV}: - Flagged: yes`);
  });

  it('shows the main file for a System', async () => {
    const { tracker } = world(mixed);
    await tracker.read();
    expect(tracker.flagCommand('route', true)).toBe(`${MAP}: + Flagged: yes`);
    expect(tracker.flagCommand('export', false)).toBe(`${SPEC}: - Flagged: yes`);
  });

  it('shows a globbed path before the board read the file', () => {
    const { tracker } = world(mixed);
    expect(tracker.flagCommand('export/01', true)).toBe(
      `${SCRATCH}/export/issues/01-*.md: + Flagged: yes`,
    );
  });
});
