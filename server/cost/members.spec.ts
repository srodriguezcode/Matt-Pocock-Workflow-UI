import { describe, expect, it } from 'vitest';
import { rawIssue, sky, system, ticket } from '#server/launch/fixtures.ts';
import { FakeTracker } from '#server/testing/fake-tracker.ts';
import type { RawIssue } from '#server/tracker/tracker.ts';
import { costMembers } from './members.ts';
import type { CostMember } from './session.ts';

const parent = (id: string, kids: string[], extra: Partial<RawIssue> = {}) =>
  rawIssue(id, { childIds: kids, children: { total: kids.length, closed: 0 }, ...extra });

const graph = [
  parent('1', ['2', '3', '4']),
  rawIssue('2', { parentId: '1' }),
  rawIssue('3', { parentId: '1', state: 'closed', closeReason: 'not-planned' }),
  parent('4', ['5'], { parentId: '1' }),
  rawIssue('5', { parentId: '4', state: 'closed', closeReason: 'completed' }),
  parent('6', ['7'], { state: 'closed' }),
  rawIssue('7', { parentId: '6', state: 'closed', closeReason: 'completed' }),
  parent('8', ['9']),
  parent('9', ['8'], { parentId: '8' }),
  rawIssue('10'),
];

const board = sky({
  systems: [system('1'), system('6', { closed: true }), system('8')],
  tickets: [ticket('10')],
});

const members = (id: string) =>
  costMembers(new FakeTracker({ tracker: 'github', viewer: 'me', issues: graph }), board, id);

const member = (id: string, extra: Partial<CostMember> = {}): CostMember => ({
  id,
  handle: `#${id}`,
  closed: false,
  closeReason: null,
  parentId: null,
  system: false,
  ...extra,
});

describe('costMembers', () => {
  it('lists a System, its open and closed children, and a child System with its grandchild', async () => {
    expect(await members('1')).toEqual([
      member('1', { system: true }),
      member('2', { parentId: '1' }),
      member('3', { parentId: '1', closed: true, closeReason: 'not-planned' }),
      member('4', { parentId: '1', system: true }),
      member('5', { parentId: '4', closed: true, closeReason: 'completed' }),
    ]);
  });

  it('lists a Ticket as itself alone', async () => {
    expect(await members('10')).toEqual([member('10')]);
  });

  it('keeps a closed System and its closed child closed', async () => {
    expect(await members('6')).toEqual([
      member('6', { closed: true, system: true }),
      member('7', { parentId: '6', closed: true, closeReason: 'completed' }),
    ]);
  });

  it('lists an id that is not on the Sky as itself', async () => {
    expect(await members('99')).toEqual([member('99', { handle: '99' })]);
  });

  it('stops at a cycle and lists each issue once', async () => {
    expect(await members('8')).toEqual([
      member('8', { system: true }),
      member('9', { parentId: '8', system: true }),
    ]);
  });
});
