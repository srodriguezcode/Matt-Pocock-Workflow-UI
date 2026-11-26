import { describe, expect, it } from 'vitest';
import type { Sky } from '@contract/sky';
import { rawIssue as issue } from '#server/launch/fixtures.ts';
import type { RawIssue } from '#server/tracker/tracker.ts';
import { buildSky } from './model.ts';

const NOW = new Date('2026-09-25T20:00:00Z');
const DAYS_29 = '2026-08-27T20:00:00Z';
const DAYS_30 = '2026-08-26T20:00:00Z';

const labels = (...names: string[]) => names.map((name) => ({ name, color: '' }));
const agent = labels('ready-for-agent');
const map = labels('wayfinder:map');

const sky = (issues: RawIssue[]): Sky =>
  buildSky({ tracker: 'github', viewer: 'me', issues }, {}, NOW).sky;
const oldOf = (s: Sky) =>
  Object.fromEntries([...s.tickets, ...s.systems].map((star) => [star.id, star.old]));

describe('Old tickets', () => {
  it('marks a Clear ticket Old at 30 days, whatever its Readiness', () => {
    const s = sky([
      issue('1', { labels: agent, createdAt: DAYS_29 }),
      issue('2', { labels: agent, createdAt: DAYS_30 }),
      issue('3', { labels: labels('needs-triage'), createdAt: DAYS_30 }),
      issue('4', { createdAt: DAYS_30 }),
      issue('5', { labels: agent }),
    ]);
    expect(s.tickets.map((t) => [t.id, t.gate, t.readiness, t.old])).toEqual([
      ['1', 'clear', 'ready-for-agent', false],
      ['2', 'clear', 'ready-for-agent', true],
      ['3', 'clear', 'undecided', true],
      ['4', 'clear', 'none', true],
      ['5', 'clear', 'ready-for-agent', false],
    ]);
  });

  it('never marks In flight or Blocked Old', () => {
    const s = sky([
      issue('1', { labels: agent }),
      issue('2', { labels: agent, assignees: ['ana'], createdAt: DAYS_30 }),
      issue('3', { labels: agent, blockedByIds: ['1'], createdAt: DAYS_30 }),
    ]);
    expect(s.tickets.map((t) => [t.id, t.gate, t.old])).toEqual([
      ['1', 'clear', false],
      ['2', 'in-flight', false],
      ['3', 'blocked', false],
    ]);
  });
});

describe('Old Systems', () => {
  it('marks every System above an Old ticket, the Map included', () => {
    const s = sky([
      issue('1', { labels: map, createdAt: DAYS_30 }),
      issue('2', { title: 'Spec: a', parentId: '1', createdAt: DAYS_29 }),
      issue('3', { title: 'Spec: b', parentId: '2' }),
      issue('4', { parentId: '3', labels: agent, createdAt: DAYS_30 }),
      issue('5', { title: 'Spec: c' }),
      issue('6', { parentId: '5', labels: agent, assignees: ['ana'], createdAt: DAYS_30 }),
    ]);
    expect(oldOf(s)).toEqual({
      '1': true,
      '2': true,
      '3': true,
      '4': true,
      '5': false,
      '6': false,
    });
  });

  it('marks a Spec in Needs tickets Old on its own Age', () => {
    const s = sky([
      issue('1', { title: 'Spec: a', createdAt: DAYS_30 }),
      issue('2', { title: 'Spec: b', createdAt: DAYS_29 }),
      issue('3', { title: 'Spec: c', createdAt: DAYS_30 }),
      issue('4', { parentId: '3', labels: agent }),
    ]);
    expect(s.systems.map((x) => [x.id, x.state, x.old])).toEqual([
      ['1', 'needs-tickets', true],
      ['2', 'needs-tickets', false],
      ['3', 'live', false],
    ]);
  });

  it('keeps the Map from being Old on its own Age', () => {
    const s = sky([
      issue('1', { labels: map, createdAt: DAYS_30 }),
      issue('2', { labels: map, createdAt: DAYS_30 }),
      issue('3', { parentId: '2', labels: labels('wayfinder:research') }),
    ]);
    expect(s.systems.map((x) => [x.id, x.kind, x.state, x.old])).toEqual([
      ['1', 'map', 'needs-tickets', false],
      ['2', 'map', 'live', false],
    ]);
  });

  it('keeps a plain System from being Old on its own Age', () => {
    const s = sky([issue('1', { systemHint: 'plain', createdAt: DAYS_30 })]);
    expect(s.systems.map((x) => [x.id, x.kind, x.state, x.old])).toEqual([
      ['1', 'plain', 'needs-tickets', false],
    ]);
  });
});
