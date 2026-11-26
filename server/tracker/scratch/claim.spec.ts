import { describe, expect, it } from 'vitest';
import type { LaunchEvent, LaunchPlan, StarTarget } from '@contract/launch';
import { withDefaults } from '#server/config/store.ts';
import { testHub } from '#server/testing/fake-link.ts';
import { executeStart } from '#server/launch/execute.ts';
import { planStart } from '#server/launch/plan.ts';
import { buildSky } from '#server/sky/model.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { ReleaseRefused, type Tracker } from '#server/tracker/tracker.ts';
import { scratchTracker } from './adapter.ts';
import { ciHooks, mixed, ROOT, SCRATCH } from './fixtures.ts';

const repo = withDefaults({ path: ROOT, owner: 'me', name: 'app' });
const CSV = `${SCRATCH}/export/issues/01-csv.md`;
const CI_02 = `${SCRATCH}/ci-hooks/issues/02-check-changed-files.md`;
const DECISION = `${SCRATCH}/route/issues/02-tile-cache.md`;

const solo: Record<string, string> = {
  [`${SCRATCH}/solo/issues/01-first.md`]: '# 01 — First\n\nStatus: ready-for-agent\n',
  [`${SCRATCH}/solo/issues/02-second.md`]:
    '# 02 — Second\n\nBlocked by: 01\nStatus: ready-for-agent\n',
};

function world(files: Record<string, string>) {
  const fs = new FakeFs(files);
  return { fs, tracker: scratchTracker(fs, new FakeRunner(), repo) };
}

describe('Claim and Release', () => {
  it('round-trips a bold Status line byte for byte', async () => {
    const { fs, tracker } = world(ciHooks);
    expect(await tracker.claim('ci-hooks/02')).toBe('ready-for-agent');
    expect(fs.files.get(CI_02)).toBe(ciHooks[CI_02]!.replace('ready-for-agent', 'claimed'));
    expect(await tracker.taken({ id: 'ci-hooks/02', handle: '02' })).toEqual({
      code: 'claimed',
      handle: '02',
    });
    await tracker.release('ci-hooks/02', 'ready-for-agent');
    expect(fs.files.get(CI_02)).toBe(ciHooks[CI_02]);
  });

  it('round-trips a plain Status line', async () => {
    const { fs, tracker } = world(mixed);
    const previous = await tracker.claim('export/01');
    expect(fs.files.get(CSV)).toBe('# 01 — CSV export\n\nStatus: claimed\n');
    await tracker.release('export/01', previous);
    expect(fs.files.get(CSV)).toBe(mixed[CSV]);
  });

  it('adds a Status line to a Decision ticket and removes it on Release', async () => {
    const { fs, tracker } = world(mixed);
    expect(await tracker.claim('route/02')).toBeNull();
    expect(fs.files.get(DECISION)).toBe(
      mixed[DECISION]!.replace('Type: grilling\n', 'Type: grilling\nStatus: claimed\n'),
    );
    await tracker.release('route/02', null);
    expect(fs.files.get(DECISION)).toBe(mixed[DECISION]);
  });

  it('restores the default for the kind when Release has nothing to put back', async () => {
    const { fs, tracker } = world(mixed);
    await tracker.claim('export/01');
    await tracker.claim('route/02');
    await tracker.release('export/01');
    await tracker.release('route/02');
    expect(fs.files.get(CSV)).toBe(mixed[CSV]);
    expect(fs.files.get(DECISION)).toBe(mixed[DECISION]);
  });

  it('refuses a Release with nothing to put back on a ticket that is not claimed', async () => {
    const { fs, tracker } = world(mixed);
    await expect(tracker.release('export/01')).rejects.toBeInstanceOf(ReleaseRefused);
    await expect(tracker.release('export/01')).rejects.toMatchObject({
      reason: { code: 'not-claimed', status: 'ready-for-agent' },
    });
    await expect(tracker.release('route/02')).rejects.toMatchObject({
      reason: { code: 'not-claimed', status: null },
    });
    expect(fs.files.get(CSV)).toBe(mixed[CSV]);
    expect(fs.files.get(DECISION)).toBe(mixed[DECISION]);
  });

  it('edits only the header Status line, not one quoted in a section', async () => {
    const path = `${SCRATCH}/w/issues/01-quoted.md`;
    const text = '# 01 — Quoted\n\nType: grilling\n\n## Answer\n\nStatus: done\n';
    const { fs, tracker } = world({ [path]: text });
    expect(await tracker.claim('w/01')).toBeNull();
    expect(fs.files.get(path)).toBe(text.replace('grilling\n', 'grilling\nStatus: claimed\n'));
    await tracker.release('w/01');
    expect(fs.files.get(path)).toBe(text);
  });

  it('keeps line endings and trailing spaces around the value', async () => {
    const text = '# 01 — Crlf\r\n\r\n**Status:**  ready-for-agent  \r\nBody\r\n';
    const { fs, tracker } = world({ [`${SCRATCH}/w/issues/01-crlf.md`]: text });
    await tracker.claim('w/01');
    expect(fs.files.get(`${SCRATCH}/w/issues/01-crlf.md`)).toBe(
      '# 01 — Crlf\r\n\r\n**Status:**  claimed  \r\nBody\r\n',
    );
    await tracker.release('w/01', 'ready-for-agent');
    expect(fs.files.get(`${SCRATCH}/w/issues/01-crlf.md`)).toBe(text);
  });

  it('shows the Status edit on the ticket file as its command lines', async () => {
    const { tracker } = world(ciHooks);
    expect(tracker.claimCommand('ci-hooks/02')).toBe(
      `${SCRATCH}/ci-hooks/issues/02-*.md: Status: claimed`,
    );
    await tracker.read();
    expect(tracker.claimCommand('ci-hooks/02')).toBe(`${CI_02}: Status: ready-for-agent → claimed`);
    await tracker.claim('ci-hooks/02');
    expect(tracker.releaseCommand('ci-hooks/02')).toBe(
      `${CI_02}: Status: claimed → ready-for-agent`,
    );
  });

  it('shows an added and a dropped Status line on a Decision ticket', async () => {
    const { tracker } = world(mixed);
    await tracker.read();
    expect(tracker.claimCommand('route/02')).toBe(`${DECISION}: + Status: claimed`);
    await tracker.claim('route/02');
    expect(tracker.releaseCommand('route/02')).toBe(`${DECISION}: - Status: claimed`);
  });
});

describe('taken', () => {
  it('reads a resolved or wontfix Status as closed', async () => {
    const { tracker } = world(mixed);
    expect(await tracker.taken({ id: 'route/01', handle: '01' })).toEqual({
      code: 'closed',
      handle: '01',
    });
    expect(await tracker.taken({ id: 'route/03', handle: '03' })).toEqual({
      code: 'closed',
      handle: '03',
    });
  });

  it('reads a claimed Status', async () => {
    const { tracker } = world(mixed);
    expect(await tracker.taken({ id: 'export/03', handle: '03' })).toEqual({
      code: 'claimed',
      handle: '03',
    });
  });

  it('is not taken for a plain ready Status', async () => {
    const { tracker } = world(mixed);
    expect(await tracker.taken({ id: 'export/01', handle: '01' })).toBeNull();
  });
});

async function planFor(tracker: Tracker, target: StarTarget): Promise<LaunchPlan> {
  const { sky, starts } = buildSky(await tracker.read(), {}, new Date('2026-09-25T20:00:00Z'));
  const result = planStart({
    sky,
    option: starts[target.id],
    repo,
    target,
    base: null,
    origin: { branches: ['main'], defaultBranch: 'main' },
    local: { branches: [], worktrees: [] },
    commands: {
      reread: (id) => tracker.takenCommand(id),
      claim: (id) => tracker.claimCommand(id),
      skillArg: (ref, skill) => tracker.skillArg(ref, skill),
      branchSlug: (ref) => tracker.branchSlug(ref),
    },
  });
  if (!result.ok) throw new Error(result.reason.code);
  return result.plan;
}

describe('Start on a .scratch/ repo', () => {
  it('gives every target an absolute main-checkout path', async () => {
    const { tracker } = world({ ...mixed, ...solo });
    const WT = '/code/app.worktrees/feature';
    const skills = await Promise.all(
      (
        [
          { kind: 'ticket', id: 'export/01' },
          { kind: 'system', id: 'solo' },
          { kind: 'decision', id: 'route/02' },
          { kind: 'map', id: 'route' },
        ] as const
      ).map(async (target) => {
        const plan = await planFor(tracker, target);
        return [plan.skill, plan.cwd];
      }),
    );
    expect(skills).toEqual([
      [`/implement-ticket ${CSV}`, `${WT}/export-01`],
      [`/implement-parallel ${SCRATCH}/solo`, `${WT}/solo`],
      [`/wayfinder ${SCRATCH}/route/map.md ${DECISION}`, ROOT],
      [`/wayfinder ${SCRATCH}/route/map.md`, ROOT],
    ]);
  });

  it('puts the Status line back when the worktree step fails', async () => {
    const { fs, tracker } = world(mixed);
    const plan = await planFor(tracker, { kind: 'ticket', id: 'export/01' });
    const runner = new FakeRunner()
      .on(['git', 'ls-remote'], {})
      .on(['git', 'fetch'], {})
      .on(['git', 'worktree'], { code: 128, stderr: 'fatal: no space left' });
    const events: LaunchEvent[] = [];
    for await (const e of executeStart(plan, {
      runner,
      tracker,
      checkout: ROOT,
      sessions: testHub(),
    }))
      events.push(e);
    expect(events).toContainEqual({
      type: 'rollback',
      command: `${CSV}: Status: claimed → ready-for-agent`,
      ok: true,
      stderr: null,
    });
    expect(events.at(-1)).toEqual({
      type: 'end',
      ok: false,
      outcome: {
        code: 'step-failed',
        action: { code: 'worktree-new', branch: 'feature/export-01', base: 'main' },
        rollback: 'rolled-back',
      },
    });
    expect(fs.files.get(CSV)).toBe(mixed[CSV]);
  });

  it('removes the added Status line when a Decision Start fails', async () => {
    const { fs, tracker } = world(mixed);
    const plan = await planFor(tracker, { kind: 'decision', id: 'route/02' });
    const runner = new FakeRunner().on(['osascript'], { code: 1, stderr: 'no iTerm2' });
    const events: LaunchEvent[] = [];
    for await (const e of executeStart(plan, {
      runner,
      tracker,
      checkout: ROOT,
      sessions: testHub(),
    }))
      events.push(e);
    expect(events.at(-1)).toMatchObject({
      ok: false,
      outcome: { code: 'step-failed', rollback: 'rolled-back' },
    });
    expect(fs.files.get(DECISION)).toBe(mixed[DECISION]);
  });

  it('stops on a ticket someone claimed since the sky was read', async () => {
    const { fs, tracker } = world(mixed);
    const plan = await planFor(tracker, { kind: 'ticket', id: 'export/01' });
    await fs.write(CSV, '# 01 — CSV export\n\nStatus: claimed\n');
    const events: LaunchEvent[] = [];
    const runner = new FakeRunner();
    for await (const e of executeStart(plan, {
      runner,
      tracker,
      checkout: ROOT,
      sessions: testHub(),
    }))
      events.push(e);
    expect(events.at(-1)).toEqual({
      type: 'end',
      ok: false,
      outcome: { code: 'taken', taken: { code: 'claimed', handle: '01' } },
    });
    expect(runner.calls).toEqual([]);
  });

  it('reads any spelling of claimed as Taken', async () => {
    const { fs, tracker } = world(mixed);
    const plan = await planFor(tracker, { kind: 'ticket', id: 'export/01' });
    await fs.write(CSV, '# 01 — CSV export\n\nStatus: `Claimed`\n');
    const events: LaunchEvent[] = [];
    for await (const e of executeStart(plan, {
      runner: new FakeRunner(),
      tracker,
      checkout: ROOT,
      sessions: testHub(),
    }))
      events.push(e);
    expect(events.at(-1)).toMatchObject({ ok: false, outcome: { code: 'taken' } });
    expect(fs.files.get(CSV)).toBe('# 01 — CSV export\n\nStatus: `Claimed`\n');
  });
});
