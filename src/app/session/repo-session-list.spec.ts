import { describe, expect, it } from 'vitest';
import type { SessionView } from '@contract/session';
import { repoSessionsOf } from './repo-session-list';

const session = (id: string, over: Partial<SessionView>): SessionView => ({
  sessionId: id,
  repo: '/a',
  target: { kind: 'session', key: id, title: '' },
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

describe('repoSessionsOf', () => {
  it("lists the repo's live new sessions, newest first, and no star's session", () => {
    const list = repoSessionsOf(
      [
        session('old', {}),
        session('new', { startedAt: '2026-09-30T09:30:00Z', state: 'asking' }),
        session('done', { state: 'ended' }),
        session('elsewhere', { repo: '/b' }),
        session('star', { target: { kind: 'ticket', id: '7' } }),
      ],
      '/a',
    );
    expect(list.map((s) => s.sessionId)).toEqual(['new', 'old']);
  });
});
