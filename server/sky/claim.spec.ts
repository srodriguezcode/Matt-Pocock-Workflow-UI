import { describe, expect, it } from 'vitest';
import type { RawIssue } from '#server/tracker/tracker.ts';
import { readClaim } from './claim.ts';

const issue = (assignees: string[]): RawIssue => ({
  id: '20',
  handle: '#20',
  number: 20,
  title: 'Issue 20',
  body: '',
  url: null,
  path: null,
  state: 'open',
  createdAt: null,
  closeReason: null,
  labels: [],
  assignees,
  claim: { holder: assignees[0] ?? null, since: '2026-09-20T00:00:00Z' },
  parentId: null,
  childIds: [],
  children: { total: 0, closed: 0 },
  blockedByIds: [],
  outsideBlockers: [],
  systemHint: null,
  typeLine: null,
  base: null,
  namedParentId: null,
  flagged: false,
});

const now = new Date('2026-09-25T00:00:00Z');

describe('readClaim', () => {
  it('counts the viewer among any assignee, not only the first', () => {
    expect(readClaim(issue(['ana', 'me']), 'me', now)).toMatchObject({
      holder: 'me',
      mine: true,
    });
  });

  it('names the first assignee when the viewer holds nothing', () => {
    expect(readClaim(issue(['ana', 'bo']), 'me', now)).toMatchObject({
      holder: 'ana',
      mine: false,
      ageDays: 5,
    });
  });

  it('reads a local claim, which records no holder, as yours', () => {
    const local = { ...issue([]), claim: { holder: null, since: null } };
    expect(readClaim(local, null, now)).toMatchObject({ holder: null, mine: true });
  });
});
