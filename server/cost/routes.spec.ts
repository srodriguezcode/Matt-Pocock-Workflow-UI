import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configPath, withDefaults } from '#server/config/store.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { transcriptRoot } from './read.ts';
import { costRoute } from './routes.ts';
import { linked } from '#server/testing/fake-link.ts';

const stdout = readFileSync(
  new URL('../sky/fixtures/harbor-graphql.json', import.meta.url),
  'utf8',
);
const HOME = '/home/me';
const repo = withDefaults({
  path: '/code/harbor-cost',
  owner: 'ana-reyes',
  name: 'harbor',
});

function transcript(cwd: string, messageId = 'msg_1'): string {
  const at = (s: number) => new Date(Date.UTC(2026, 8, 28, 9, 0, s)).toISOString();
  return [
    { type: 'user', turnOrigin: 'human', message: { content: '/implement-ticket #643' } },
    {
      type: 'assistant',
      message: {
        id: messageId,
        model: 'claude-opus-5-5',
        usage: {
          input_tokens: 3,
          output_tokens: 40,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 9000,
        },
      },
    },
  ]
    .map((line, i) => JSON.stringify({ ...line, isSidechain: false, cwd, timestamp: at(i * 45) }))
    .join('\n');
}

describe('GET /api/cost', () => {
  it('returns the Cost reading of a ticket', async () => {
    const cwd = '/code/harbor-cost.worktrees/feature/643';
    const fs = new FakeFs({
      [configPath(HOME)]: JSON.stringify({ repos: [repo] }),
      [`${repo.path}/docs/agents/issue-tracker.md`]: '# Issue tracker: GitHub\n',
      [join(transcriptRoot(HOME), cwd.replace(/[^a-zA-Z0-9]/g, '-'), 's1.jsonl')]: transcript(cwd),
    });
    const runner = new FakeRunner().on(['gh', 'api', 'graphql'], { stdout });
    const reply = await costRoute(
      { runner, fs, home: HOME, now: () => new Date('2026-09-28T10:00:00Z'), ...linked() },
      {
        method: 'GET',
        path: '/api/cost',
        query: new URLSearchParams({ repo: repo.path, id: '643' }),
        body: null,
        headers: {},
        signal: new AbortController().signal,
      },
    );
    expect(reply).toEqual({
      status: 200,
      body: {
        id: '643',
        sessions: 1,
        tokens: { input: 3, output: 40, cacheCreation: 500, cacheRead: 9000 },
        dollars: expect.closeTo((3 * 4 + 40 * 20 + 500 * 5 + 9000 * 0.2) / 1_000_000, 9),
        workingMs: 45_000,
        partial: [],
      },
    });
  });

  it('returns the summed Cost reading of a System, whole when its own Session covers a closed child', async () => {
    const own = '/code/harbor-cost.worktrees/feature/602';
    const child = '/code/harbor-cost.worktrees/feature/643';
    const node = (number: number, state: 'OPEN' | 'CLOSED') => ({
      number,
      title: `Ticket ${number}`,
      state,
      stateReason: null,
      url: `https://github.com/ana-reyes/harbor/issues/${number}`,
      repository: { nameWithOwner: 'ana-reyes/harbor' },
      labels: { nodes: [] },
      subIssuesSummary: { total: 0, completed: 0 },
      blockedBy: { nodes: [] },
    });
    const children = {
      data: {
        repository: {
          issue: { subIssues: { nodes: [node(643, 'OPEN'), node(634, 'CLOSED')] } },
        },
      },
    };
    const fs = new FakeFs({
      [configPath(HOME)]: JSON.stringify({ repos: [repo] }),
      [`${repo.path}/docs/agents/issue-tracker.md`]: '# Issue tracker: GitHub\n',
      [join(transcriptRoot(HOME), own.replace(/[^a-zA-Z0-9]/g, '-'), 's0.jsonl')]: transcript(
        own,
        'msg_0',
      ),
      [join(transcriptRoot(HOME), child.replace(/[^a-zA-Z0-9]/g, '-'), 's1.jsonl')]:
        transcript(child),
    });
    const runner = new FakeRunner().on(['gh', 'api', 'graphql'], ({ args }) => ({
      stdout: args.includes('number=602') ? JSON.stringify(children) : stdout,
    }));
    const reply = await costRoute(
      { runner, fs, home: HOME, now: () => new Date('2026-09-28T10:00:00Z'), ...linked() },
      {
        method: 'GET',
        path: '/api/cost',
        query: new URLSearchParams({ repo: repo.path, id: '602' }),
        body: null,
        headers: {},
        signal: new AbortController().signal,
      },
    );
    expect(reply).toEqual({
      status: 200,
      body: {
        id: '602',
        sessions: 2,
        tokens: { input: 6, output: 80, cacheCreation: 1000, cacheRead: 18_000 },
        dollars: expect.closeTo(2 * ((3 * 4 + 40 * 20 + 500 * 5 + 9000 * 0.2) / 1_000_000), 9),
        workingMs: 90_000,
        partial: [],
      },
    });
  });
});
