import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { withDefaults } from '#server/config/store.ts';
import type { Deps } from '#server/http/types.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { mixed, ROOT, SCRATCH } from '#server/tracker/scratch/fixtures.ts';
import type { SkyPage } from '#server/tracker/github/query.ts';
import { prepareStart, startBlock } from './prepare.ts';
import { linked } from '#server/testing/fake-link.ts';

const stdout = readFileSync(
  new URL('../sky/fixtures/harbor-graphql.json', import.meta.url),
  'utf8',
);
/** Tests that read the Sky twice take their own path, so the read cache can't leak between them. */
const repoAt = (path: string) => withDefaults({ path, owner: 'ana-reyes', name: 'harbor' });
const repo = repoAt('/code/harbor');
const skills = Object.fromEntries(
  ['implement', 'implement-ticket', 'implement-parallel', 'wayfinder'].map((name) => [
    `/home/me/.claude/skills/${name}/SKILL.md`,
    '',
  ]),
);

function withoutDecisions(): string {
  const pages = JSON.parse(stdout) as SkyPage[];
  for (const page of pages) {
    for (const node of page.data.repository.issues.nodes) {
      if (node.parent?.number === 512) node.state = 'CLOSED';
    }
  }
  return JSON.stringify(pages);
}

function deps(runner: FakeRunner, files: Record<string, string> = {}, path = repo.path): Deps {
  const fs = new FakeFs({
    [`${path}/docs/agents/issue-tracker.md`]: '# Issue tracker: GitHub\n',
    ...files,
  });
  return { runner, fs, home: '/home/me', now: () => new Date('2026-09-25T20:00:00Z'), ...linked() };
}

describe('prepareStart', () => {
  it('plans a Map Start without asking origin or the local checkout', async () => {
    const runner = new FakeRunner().on(['gh', 'api', 'graphql'], { stdout });
    await prepareStart(deps(runner), repo, { kind: 'map', id: '512' }, null);
    expect(runner.calls.filter((c) => c.command === 'git')).toEqual([]);
  });

  it('plans a Start from a fresh read, so a Map with no Decision left is refused', async () => {
    const own = repoAt('/code/harbor-fresh');
    const runner = new FakeRunner().on(['gh', 'api', 'graphql'], { stdout });
    const d = deps(runner, {}, own.path);
    const target = { kind: 'map', id: '512' } as const;
    expect((await prepareStart(d, own, target, null)).result.ok).toBe(true);
    runner.on(['gh', 'api', 'graphql'], { stdout: withoutDecisions() });
    expect((await prepareStart(d, own, target, null)).result.ok).toBe(true);
    expect((await prepareStart(d, own, target, null, { fresh: true })).result).toEqual({
      ok: false,
      reason: { code: 'no-decision-frontier' },
    });
  });

  it('shows the re-read line the Tracker runs', async () => {
    const runner = new FakeRunner()
      .on(['gh', 'api', 'graphql'], { stdout })
      .on(['gh', 'issue', 'view'], { stdout: '{"state":"OPEN","assignees":[]}' });
    const own = repoAt('/code/harbor-reread');
    const d = deps(runner, {}, own.path);
    const { result, tracker } = await prepareStart(d, own, { kind: 'decision', id: '599' }, null);
    if (!result.ok) throw new Error(result.reason.code);
    await tracker.taken({ id: '599', handle: '#599' });
    expect(result.plan.steps.find((s) => s.key === 'reread')?.commands).toEqual([
      runner.lines().at(-1),
    ]);
  });

  it('plans a new session without reading the Sky, so a failed read does not stop it', async () => {
    const runner = new FakeRunner().on(['gh', 'api', 'graphql'], { code: 1, stderr: 'down' });
    const own = repoAt('/code/harbor-session');
    const target = { kind: 'session', key: 'k1', prompt: 'hi' } as const;
    const { result, sky } = await prepareStart(deps(runner, {}, own.path), own, target, null);
    if (!result.ok) throw new Error(result.reason.code);
    expect(sky).toBeNull();
    expect(result.plan.command).toMatch(/ "hi"$/);
    expect(result.plan.command).toContain('kind=session&key=k1&title=hi');
    expect(runner.calls).toEqual([]);
  });

  it('reads origin for a ticket Start', async () => {
    const runner = new FakeRunner()
      .on(['gh', 'api', 'graphql'], { stdout })
      .on(['git', 'ls-remote'], { code: 128, stderr: 'offline' });
    await expect(
      prepareStart(deps(runner), repo, { kind: 'ticket', id: '613' }, null),
    ).rejects.toThrow('offline');
  });

  it('reads .scratch/ once and names the ticket file in the claim line', async () => {
    const fs = new FakeFs({
      [`${ROOT}/docs/agents/issue-tracker.md`]: '# Issue tracker: Local Markdown\n',
      ...mixed,
    });
    const listed: string[] = [];
    const list = fs.list.bind(fs);
    fs.list = (dir) => {
      listed.push(dir);
      return list(dir);
    };
    const scratchRepo = withDefaults({ path: ROOT, owner: 'me', name: 'app' });
    const scratchDeps = { ...deps(new FakeRunner()), fs };
    const { result } = await prepareStart(
      scratchDeps,
      scratchRepo,
      { kind: 'decision', id: 'route/02' },
      null,
    );
    if (!result.ok) throw new Error(result.reason.code);
    expect(listed.filter((dir) => dir === SCRATCH)).toHaveLength(1);
    expect(result.plan.steps.find((s) => s.key === 'reread')?.commands).toEqual([
      `cat ${SCRATCH}/route/issues/02-tile-cache.md`,
    ]);
    expect(result.plan.steps.find((s) => s.key === 'claim')?.commands).toEqual([
      `${SCRATCH}/route/issues/02-tile-cache.md: + Status: claimed`,
    ]);
  });
});

describe('startBlock', () => {
  const iterm = { '/Applications/iTerm.app/Contents/Info.plist': '', ...skills };
  const machine = () =>
    new FakeRunner().on(['which'], { code: 0 }).on(['gh', 'auth', 'status'], { code: 0 });

  it('names the start Gap that disables this kind of Start', async () => {
    const runner = machine().on(['which', 'claude'], { code: 1 });
    expect(await startBlock(deps(runner, iterm), repo, { kind: 'map', id: '512' })).toEqual({
      code: 'claude-missing',
    });
  });

  it('lets the Start through on a ready machine', async () => {
    expect(
      await startBlock(deps(machine(), iterm), repo, { kind: 'ticket', id: '613' }),
    ).toBeNull();
  });

  it('names a missing skill for the Start kinds it runs, and only those', async () => {
    const d = deps(machine(), {
      '/Applications/iTerm.app/Contents/Info.plist': '',
      '/home/me/.claude/skills/implement/SKILL.md': '',
      '/home/me/.claude/skills/implement-ticket/SKILL.md': '',
    });
    expect(await startBlock(d, repo, { kind: 'decision', id: '599' })).toEqual({
      code: 'skill-missing',
      skill: 'wayfinder',
    });
    expect(await startBlock(d, repo, { kind: 'ticket', id: '613' })).toBeNull();
  });
});
