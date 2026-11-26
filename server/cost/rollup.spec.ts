import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withDefaults } from '#server/config/store.ts';
import type { Deps } from '#server/http/types.ts';
import { rawIssue, sky, system } from '#server/launch/fixtures.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { FakeTracker } from '#server/testing/fake-tracker.ts';
import { readCost, transcriptRoot } from './read.ts';
import { linked } from '#server/testing/fake-link.ts';

const HOME = '/home/me';
const ROOT = transcriptRoot(HOME);
const repo = withDefaults({ path: '/code/uaw', owner: 'me', name: 'uaw' });
const MINUTE = 60_000;

interface Turn {
  output: number;
  model?: string;
  start?: string;
}

function transcript(id: string, cwd: string, turn: Turn): Record<string, string> {
  const start = Date.parse(turn.start ?? '2026-09-28T09:00:00.000Z');
  const at = (ms: number) => new Date(start + ms).toISOString();
  const lines = [
    { type: 'user', turnOrigin: 'human', message: { content: 'Go.' }, timestamp: at(0) },
    {
      type: 'assistant',
      message: {
        id: `msg_${id}`,
        model: turn.model ?? 'claude-opus-5-5',
        usage: {
          input_tokens: 0,
          output_tokens: turn.output,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
      timestamp: at(10 * MINUTE),
    },
  ].map((line) => JSON.stringify({ ...line, isSidechain: false, cwd, sessionId: id }));
  const dir = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  return { [join(ROOT, dir, `${id}.jsonl`)]: lines.join('\n') };
}

const worktree = (issue: string) => `/code/uaw.worktrees/feature/${issue}`;

function graph() {
  const issues = [
    rawIssue('100', {
      childIds: ['101', '102', '103', '105', '106'],
      children: { total: 5, closed: 4 },
    }),
    rawIssue('101', { parentId: '100' }),
    rawIssue('102', { parentId: '100', state: 'closed' }),
    rawIssue('103', {
      parentId: '100',
      state: 'closed',
      childIds: ['104'],
      children: { total: 1, closed: 1 },
    }),
    rawIssue('104', { parentId: '103', state: 'closed' }),
    rawIssue('105', { parentId: '100', state: 'closed' }),
    rawIssue('106', { parentId: '100', state: 'closed', closeReason: 'not-planned' }),
  ];
  return new FakeTracker({ tracker: 'github', viewer: null, issues });
}

const board = sky({ systems: [system('100')] });

function costOf(files: Record<string, string>) {
  const deps: Deps = {
    runner: new FakeRunner(),
    fs: new FakeFs(files),
    home: HOME,
    now: () => new Date(),
    ...linked(),
  };
  return readCost(deps, repo, graph(), board, '100');
}

const everyone = () => ({
  ...transcript('own', worktree('100'), { output: 1 }),
  ...transcript('open', worktree('101'), { output: 10 }),
  ...transcript('closed', worktree('102'), { output: 100 }),
  ...transcript('grandchild', worktree('104'), { output: 1000 }),
  ...transcript('gone', worktree('105'), { output: 10_000 }),
});

function without(files: Record<string, string>, ...issues: string[]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).filter(([path]) => !issues.some((i) => path.includes(`feature-${i}/`))),
  );
}

describe('the Cost of a System', () => {
  it('sums its own Session and its children, recursively, closed ones included', async () => {
    const reading = await costOf({
      ...everyone(),
      ...transcript('outside', worktree('7'), { output: 100_000 }),
    });
    expect(reading.id).toBe('100');
    expect(reading.sessions).toBe(5);
    expect(reading.tokens.output).toBe(11_111);
    expect(reading.dollars).toBeCloseTo((11_111 * 20) / 1_000_000, 9);
    expect(reading.workingMs).toBe(5 * 10 * MINUTE);
    expect(reading.partial).toEqual([]);
  });

  it('adds the Working time of two parallel Sessions instead of taking the wall clock', async () => {
    const reading = await costOf({
      ...transcript('a', worktree('101'), { output: 1 }),
      ...transcript('b', worktree('104'), { output: 1, start: '2026-09-28T09:05:00.000Z' }),
    });
    expect(reading.sessions).toBe(2);
    expect(reading.workingMs).toBe(20 * MINUTE);
  });

  it('is partial, naming the handle, when a closed child has no transcript left', async () => {
    const reading = await costOf(without(everyone(), '100', '105'));
    expect(reading.sessions).toBe(3);
    expect(reading.partial).toEqual([{ code: 'aged-out', handles: ['#105'] }]);
  });

  it('is whole when a Frontier system Start on it ran its closed tickets', async () => {
    const reading = await costOf(without(everyone(), '102', '104', '105'));
    expect(reading.sessions).toBe(2);
    expect(reading.partial).toEqual([]);
  });

  it('is whole when a closed child System has no Session but its tickets do', async () => {
    const reading = await costOf(without(everyone(), '100'));
    expect(reading.sessions).toBe(4);
    expect(reading.partial).toEqual([]);
  });

  it('is partial when a child ran a model the price table lacks', async () => {
    const reading = await costOf({
      ...everyone(),
      ...transcript('mystery', worktree('101'), { output: 5, model: 'claude-opus-9' }),
    });
    expect(reading.partial).toEqual([{ code: 'no-price', models: ['claude-opus-9'] }]);
    expect(reading.tokens.output).toBe(11_116);
    expect(reading.dollars).toBeCloseTo((11_111 * 20) / 1_000_000, 9);
  });
});
