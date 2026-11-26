import { describe, expect, it } from 'vitest';
import type { RepoConfig } from '@contract/repo';
import type { FileSystem } from '#server/core/fs.ts';
import type { Deps } from '#server/http/types.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { checkRepo } from './repo.ts';
import { linked } from '#server/testing/fake-link.ts';

const repo: RepoConfig = {
  path: '/code/app',
  owner: 'me',
  name: 'app',
  branchPrefixes: [],
  fallbackPrefix: 'feature',
  labels: {},
  tile: { letters: 'AP' },
};

const deps = (runner: FakeRunner, fs: FileSystem): Deps => ({
  runner,
  fs,
  home: '/home/dev',
  now: () => new Date('2026-09-25T20:00:00Z'),
  ...linked(),
});

const trackerFile = (kind: string) => ({
  '/code/app/docs/agents/issue-tracker.md': `# Issue tracker: ${kind}\n`,
});

const allSkills = {
  '/code/app/.claude/skills/implement/SKILL.md': '',
  '/code/app/.claude/skills/implement-ticket/SKILL.md': '',
  '/code/app/.claude/skills/implement-parallel/SKILL.md': '',
  '/code/app/.claude/skills/wayfinder/SKILL.md': '',
  '/code/app/.claude/skills/to-tickets/SKILL.md': '',
  '/code/app/.claude/skills/improve-codebase-architecture/SKILL.md': '',
};

describe('checkRepo', () => {
  it('reports only the fatal tracker Gap when the file is missing', async () => {
    const gaps = await checkRepo(deps(new FakeRunner(), new FakeFs()), repo, '/board');
    expect(gaps).toEqual([
      expect.objectContaining({
        id: 'tracker-missing',
        tier: 'fatal',
        problem: { code: 'tracker-missing', file: 'docs/agents/issue-tracker.md' },
      }),
    ]);
  });

  it('reports only the fatal tracker Gap when the tracker is unsupported', async () => {
    const fs = new FakeFs(trackerFile('GitLab'));
    const gaps = await checkRepo(deps(new FakeRunner(), fs), repo, '/board');
    expect(gaps).toEqual([expect.objectContaining({ id: 'tracker-unsupported', tier: 'fatal' })]);
  });

  it('skips label, dependency and Base checks on a scratch tracker but still checks skills', async () => {
    const fs = new FakeFs({ ...trackerFile('Local Markdown') });
    const gaps = await checkRepo(deps(new FakeRunner(), fs), repo, '/board');
    expect(gaps.map((g) => g.id)).toEqual([
      'skill-implement',
      'skill-implement-ticket',
      'skill-implement-parallel',
      'skill-wayfinder',
      'skill-to-tickets',
      'skill-improve-codebase-architecture',
    ]);
  });

  it('runs every GitHub-only check and aggregates their Gaps', async () => {
    const fs = new FakeFs({ ...trackerFile('GitHub'), ...allSkills });
    const runner = new FakeRunner()
      .on(['gh', 'label', 'list'], { stdout: '[]' })
      .on(['gh', 'issue', 'list'], { stdout: '[]' });
    const gaps = await checkRepo(deps(runner, fs), repo, '/board');
    expect(gaps.map((g) => g.id)).toEqual(['labels-missing']);
  });
});
