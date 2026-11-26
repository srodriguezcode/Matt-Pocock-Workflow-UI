import { describe, expect, it } from 'vitest';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { parseAgents, readAgents } from './agents.ts';

const listing = JSON.stringify([
  {
    pid: 15554,
    cwd: '/code/app.worktrees/feature/42',
    kind: 'interactive',
    startedAt: 1790777618094,
    sessionId: 'b974afb6',
    name: 'feature/42',
    status: 'busy',
  },
  { pid: 15600, cwd: '/code/app', kind: 'interactive', sessionId: 'c1', status: 'idle' },
  { cwd: '/code/app', kind: 'background', sessionId: 'bg', state: 'running' },
  { cwd: '/code/app', kind: 'interactive', sessionId: 'no-pid', status: 'idle' },
]);

describe('parseAgents', () => {
  it('keeps interactive entries with a pid and a sessionId', () => {
    expect(parseAgents(listing)).toEqual([
      { sessionId: 'b974afb6', pid: 15554, cwd: '/code/app.worktrees/feature/42', busy: true },
      { sessionId: 'c1', pid: 15600, cwd: '/code/app', busy: false },
    ]);
  });

  it('reads an empty listing as no Sessions', () => {
    expect(parseAgents('[]\n')).toEqual([]);
  });

  it('is null when stdout is not the listing', () => {
    expect(parseAgents('')).toBeNull();
    expect(parseAgents('Unknown command: agents')).toBeNull();
    expect(parseAgents('{"agents":[]}')).toBeNull();
  });
});

describe('readAgents', () => {
  const agents = { command: 'claude', args: ['agents', '--json'] };

  it('runs the configured command and parses it', async () => {
    const runner = new FakeRunner().on(['claude', 'agents', '--json'], { stdout: listing });
    expect(await readAgents(runner, agents)).toHaveLength(2);
  });

  it('is null when the command fails', async () => {
    const runner = new FakeRunner().on(['claude'], { code: 1, stdout: '[]' });
    expect(await readAgents(runner, agents)).toBeNull();
  });
});
