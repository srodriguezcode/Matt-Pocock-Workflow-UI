import { describe, expect, it } from 'vitest';
import type { RepoConfig } from '@contract/repo';
import type { Deps } from '#server/http/types.ts';
import { readSky } from '#server/sky/read.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import type { IssueNode, SkyPage } from '#server/tracker/github/query.ts';
import { checkBaseLines } from './base-lines.ts';
import { linked } from '#server/testing/fake-link.ts';

/** Each test uses its own repo path so the Sky-read cache can't leak stale fixtures across tests. */
function repoAt(path: string): RepoConfig {
  return {
    path,
    owner: 'me',
    name: 'app',
    branchPrefixes: [],
    fallbackPrefix: 'feature',
    labels: {},
    tile: { letters: 'AP' },
  };
}

function node(number: number, fields: { body?: string; parent?: number; spec?: boolean } = {}) {
  const issue: IssueNode = {
    number,
    title: `Issue ${number}`,
    state: 'OPEN',
    stateReason: null,
    url: '',
    labels: { nodes: fields.spec ? [{ name: 'spec', color: '' }] : [] },
    body: fields.body ?? '',
    assignees: { nodes: [] },
    parent: null,
    blockedBy: { nodes: [] },
    subIssuesSummary: { total: 0, completed: 0 },
    timelineItems: { nodes: [] },
  };
  if (fields.parent !== undefined) {
    issue.parent = {
      number: fields.parent,
      title: '',
      state: 'OPEN',
      stateReason: null,
      url: '',
      labels: { nodes: [] },
      subIssuesSummary: { total: 0, completed: 0 },
    };
  }
  return issue;
}

function deps(runner: FakeRunner, path: string): Deps {
  const fs = new FakeFs({ [`${path}/docs/agents/issue-tracker.md`]: '# Issue tracker: GitHub\n' });
  return { runner, fs, home: '/home/me', now: () => new Date('2026-09-25T20:00:00Z'), ...linked() };
}

function runnerWith(nodes: IssueNode[], branches: string[]): FakeRunner {
  const page: SkyPage = { data: { viewer: { login: 'me' }, repository: { issues: { nodes } } } };
  return new FakeRunner()
    .on(['gh', 'api', 'graphql'], { stdout: JSON.stringify([page]) })
    .on(['git', 'ls-remote'], {
      stdout: ['ref: refs/heads/main\tHEAD', ...branches.map((b) => `sha\trefs/heads/${b}`)].join(
        '\n',
      ),
    });
}

describe('checkBaseLines', () => {
  it('finds nothing when every Base line names a branch on origin', async () => {
    const repo = repoAt('/code/app-clean');
    const runner = runnerWith(
      [node(1, { body: 'Base: `develop`', spec: true })],
      ['main', 'develop'],
    );
    expect(await checkBaseLines(deps(runner, repo.path), repo)).toEqual([]);
  });

  it('flags a System whose Base is off origin without disabling its Starts', async () => {
    const repo = repoAt('/code/app-off-origin');
    const runner = runnerWith(
      [
        node(12, { body: 'Base: gone-branch', spec: true }),
        node(13, { parent: 12 }),
        node(14, { parent: 12, spec: true }),
        node(15, { parent: 14 }),
        node(16, { parent: 12, spec: true, body: 'Base: main' }),
        node(17, { parent: 16 }),
      ],
      ['main'],
    );
    expect(await checkBaseLines(deps(runner, repo.path), repo)).toEqual([
      expect.objectContaining({
        id: 'base-12',
        problem: { code: 'base-off-origin', handle: '#12' },
        scope: 'repo',
        tier: 'thin',
        blocks: [],
        fix: { command: 'git push origin gone-branch' },
        ids: ['12', '13', '14', '15'],
      }),
    ]);
  });

  it('ignores a Base line on a ticket', async () => {
    const repo = repoAt('/code/app-ticket-base');
    const runner = runnerWith([node(1, { body: 'Base: gone-branch' })], ['main']);
    expect(await checkBaseLines(deps(runner, repo.path), repo)).toEqual([]);
  });

  it('shares the Sky read already running for the repo', async () => {
    const repo = repoAt('/code/app-shared-read');
    const runner = runnerWith([node(1, { body: 'Base: gone', spec: true })], ['main']);
    const d = deps(runner, repo.path);
    const [, gaps] = await Promise.all([readSky(d, repo), checkBaseLines(d, repo)]);
    expect(gaps.map((g) => g.id)).toEqual(['base-1']);
    expect(runner.calls.filter((c) => c.command === 'gh')).toHaveLength(1);
  });

  it('gives up quietly when gh or git fails', async () => {
    const repo = repoAt('/code/app-quiet-failure');
    const failingIssues = new FakeRunner().on(['gh', 'api', 'graphql'], { code: 1 });
    expect(await checkBaseLines(deps(failingIssues, repo.path), repo)).toEqual([]);

    const failingOrigin = runnerWith([node(1, { body: 'Base: x', spec: true })], []).on(
      ['git', 'ls-remote'],
      { code: 1 },
    );
    expect(await checkBaseLines(deps(failingOrigin, repo.path), repo)).toEqual([]);
  });
});
