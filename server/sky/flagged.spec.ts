import { describe, expect, it } from 'vitest';
import type { Sky } from '@contract/sky';
import { rawIssue as issue } from '#server/launch/fixtures.ts';
import type { RawIssue } from '#server/tracker/tracker.ts';
import { buildSky } from './model.ts';

const NOW = new Date('2026-09-25T20:00:00Z');

const labels = (...names: string[]) => names.map((name) => ({ name, color: '' }));
const map = labels('wayfinder:map');

const sky = (issues: RawIssue[]): Sky =>
  buildSky({ tracker: 'github', viewer: 'me', issues }, {}, NOW).sky;
const counts = (s: Sky) => Object.fromEntries(s.systems.map((x) => [x.id, x.flaggedTickets]));

describe('flagged tickets', () => {
  it('passes each Ticket and System its own flag', () => {
    const s = sky([
      issue('1', { title: 'Spec: a', flagged: true }),
      issue('2', { parentId: '1', flagged: true }),
      issue('3', { parentId: '1' }),
    ]);
    expect([...s.systems, ...s.tickets].map((x) => [x.id, x.flagged])).toEqual([
      ['1', true],
      ['2', true],
      ['3', false],
    ]);
  });

  it("counts a System's direct open child Tickets that are flagged", () => {
    const s = sky([
      issue('1', { title: 'Spec: a' }),
      issue('2', { parentId: '1', flagged: true }),
      issue('3', { parentId: '1', flagged: true }),
      issue('4', { parentId: '1' }),
      issue('5', { title: 'Spec: b' }),
      issue('6', { parentId: '5' }),
    ]);
    expect(counts(s)).toEqual({ '1': 2, '5': 0 });
  });

  it('skips closed tickets', () => {
    const s = sky([
      issue('1', { title: 'Spec: a' }),
      issue('2', { parentId: '1', flagged: true, state: 'closed' }),
      issue('3', { parentId: '1' }),
    ]);
    expect(counts(s)).toEqual({ '1': 0 });
  });

  it('skips flagged child Systems and tickets further down', () => {
    const s = sky([
      issue('1', { title: 'Spec: a' }),
      issue('2', { title: 'Spec: b', parentId: '1', flagged: true }),
      issue('3', { parentId: '2', flagged: true }),
    ]);
    expect(counts(s)).toEqual({ '1': 0, '2': 1 });
  });

  it("keeps the Map's count at 0", () => {
    const s = sky([
      issue('1', { labels: map }),
      issue('2', { parentId: '1', labels: labels('wayfinder:research'), flagged: true }),
    ]);
    expect(counts(s)).toEqual({ '1': 0 });
  });
});
