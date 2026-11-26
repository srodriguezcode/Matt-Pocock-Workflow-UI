import { describe, expect, it } from 'vitest';
import type { RepoConfig } from '@contract/repo';
import type { SessionView } from '@contract/session';
import type { Sky } from '@contract/sky';
import { notificationsOf } from './notifications';

const session = (id: string, over: Partial<SessionView>): SessionView => ({
  sessionId: id,
  repo: '/a',
  target: { kind: 'ticket', id: '7' },
  state: 'working',
  waiting: null,
  since: '2026-09-30T10:00:00Z',
  startedAt: '2026-09-30T09:00:00Z',
  question: null,
  note: null,
  typeable: false,
  peek: [],
  ...over,
});

const repos = [
  { path: '/a', name: 'alpha' },
  { path: '/b', name: 'beta' },
] as RepoConfig[];

const sky = {
  mapId: null,
  tickets: [{ id: '7', handle: '#7', title: 'Seven' }],
  systems: [],
  embers: [{ id: '8', handle: '#8', title: 'Eight' }],
} as unknown as Sky;

describe('notificationsOf', () => {
  it('lists Asking and Waiting Sessions across repos, the longest waiting first', () => {
    const list = notificationsOf(
      [
        session('w', { state: 'working' }),
        session('r', {
          state: 'waiting',
          waiting: 'turn-end',
          since: '2026-09-30T10:05:00Z',
        }),
        session('p', {
          repo: '/b',
          target: { kind: 'ticket', id: '3' },
          state: 'waiting',
          waiting: 'permission-prompt',
          since: '2026-09-30T10:01:00Z',
        }),
        session('g', {
          state: 'asking',
          question: { kind: 'round', id: 'q', message: '', questions: [] },
          since: '2026-09-30T10:02:00Z',
        }),
      ],
      repos,
      { path: '/a', sky, placed: new Map() },
    );
    expect(list.map((n) => [n.sessionId, n.repoName, n.reason, n.handle])).toEqual([
      ['p', 'beta', 'permission', null],
      ['g', 'alpha', 'round', '#7'],
      ['r', 'alpha', 'reply', '#7'],
    ]);
  });

  it('points at the star a Session is placed on in the active repo', () => {
    const map = session('m', {
      target: { kind: 'map', id: '1' },
      state: 'asking',
      question: { kind: 'ask', id: 'q', questions: [] },
    });
    const [only] = notificationsOf([map], repos, {
      path: '/a',
      sky,
      placed: new Map([['7', { session: map }]]),
    });
    expect(only).toMatchObject({ starId: '7', handle: '#7', reason: 'ask' });
  });

  it('marks a Waiting Session finished once its target is closed', () => {
    const waiting = { state: 'waiting', waiting: 'turn-end' } as const;
    const list = notificationsOf(
      [
        session('e', { ...waiting, target: { kind: 'ticket', id: '8' } }),
        session('g', { ...waiting, target: { kind: 'ticket', id: '9' } }),
        session('o', { ...waiting, repo: '/b', target: { kind: 'ticket', id: '9' } }),
      ],
      repos,
      { path: '/a', sky, placed: new Map() },
    );
    expect(list.map((n) => [n.sessionId, n.reason, n.handle])).toEqual([
      ['e', 'finished', '#8'],
      ['g', 'finished', null],
      ['o', 'reply', null],
    ]);
  });
});

describe('notificationsOf on a new session', () => {
  it('names no star and titles it with its first line', () => {
    const target = { kind: 'session', key: 'k1', title: 'Add dark mode' } as const;
    const [item] = notificationsOf(
      [session('n', { target, state: 'waiting', waiting: 'turn-end' })],
      repos,
      { path: '/a', sky, placed: new Map() },
    );
    expect(item).toMatchObject({
      starId: null,
      handle: null,
      title: 'Add dark mode',
      reason: 'reply',
    });
  });
});
