import { describe, expect, it } from 'vitest';
import type { AttributedSession, CostMember } from './session.ts';
import { costReading } from './reading.ts';

function counted(issueId: string | null, model = 'claude-sonnet-5-5'): AttributedSession {
  return {
    id: `s-${issueId}-${model}`,
    cwd: '/code/uaw.worktrees/feature/1',
    prompt: null,
    usage: [{ model, input: 100, output: 10, cacheCreation: 0, cacheCreation1h: 0, cacheRead: 0 }],
    workingMs: 1_000,
    issueId,
  };
}

function member(id: string, extra: Partial<CostMember> = {}): CostMember {
  return {
    id,
    handle: `#${id}`,
    closed: true,
    closeReason: 'completed',
    parentId: '1',
    system: false,
    ...extra,
  };
}

const root = member('1', { closed: false, closeReason: null, parentId: null, system: true });

const agedOut = (members: CostMember[], sessions: AttributedSession[]) =>
  costReading('1', members, sessions).partial.filter((p) => p.code === 'aged-out');

describe('a reading over several members', () => {
  it('sums the members, and names every closed one whose transcripts are gone in one shortfall', () => {
    const reading = costReading(
      '1',
      [root, member('2'), member('3'), member('4')],
      [counted('4', 'claude-mini-1'), counted('5', 'claude-mini-2'), counted(null)],
    );
    expect(reading.sessions).toBe(1);
    expect(reading.tokens.input).toBe(100);
    expect(reading.workingMs).toBe(1_000);
    expect(reading.partial).toEqual([
      { code: 'aged-out', handles: ['#2', '#3'] },
      { code: 'no-price', models: ['claude-mini-1'] },
    ]);
  });

  it('counts closed tickets as covered by a Frontier system Session on the System above them', () => {
    const members = [
      root,
      member('2', { parentId: '1', system: true }),
      member('3', { parentId: '2' }),
      member('4', { parentId: '2' }),
    ];
    expect(agedOut(members, [counted('2')])).toEqual([]);
    expect(agedOut(members, [counted('1')])).toEqual([]);
  });

  it('never names a closed System, whose Cost lives in its tickets', () => {
    const members = [root, member('2', { system: true }), member('3', { parentId: '2' })];
    expect(agedOut(members, [counted('3')])).toEqual([]);
  });

  it('never names a ticket closed as not planned or duplicate, which never ran', () => {
    const members = [
      root,
      member('2', { closeReason: 'not-planned' }),
      member('3', { closeReason: 'duplicate' }),
    ];
    expect(agedOut(members, [])).toEqual([]);
  });
});
