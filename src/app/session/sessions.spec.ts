import { describe, expect, it } from 'vitest';
import type { PeekLine, SessionStatus, SessionView } from '@contract/session';
import { PEEK_LINES } from './limits';
import { applyEvent } from './sessions';

const status: SessionStatus = {
  sessionId: 's1',
  repo: '/r',
  target: { kind: 'ticket', id: '7' } as SessionStatus['target'],
  state: 'working',
  waiting: null,
  since: '2026-01-01T00:00:00Z',
  startedAt: '2026-01-01T00:00:00Z',
  question: null,
  note: null,
  typeable: false,
};
const line = (text: string): PeekLine => ({
  at: '2026-01-01T00:00:01Z',
  kind: 'tool',
  tool: 'Bash',
  text,
  full: null,
  human: false,
});
const view = (peek: PeekLine[] = []): SessionView => ({ ...status, peek });

describe('applyEvent', () => {
  it('replaces everything with a snapshot', () => {
    const next = applyEvent(new Map([['old', view()]]), {
      type: 'snapshot',
      sessions: [view()],
    });
    expect([...next.keys()]).toEqual(['s1']);
  });

  it('upserts a status and keeps the Peek', () => {
    const before = new Map([['s1', view([line('ls')])]]);
    const next = applyEvent(before, { type: 'status', session: { ...status, state: 'waiting' } });
    expect(next.get('s1')?.state).toBe('waiting');
    expect(next.get('s1')?.peek.map((l) => l.text)).toEqual(['ls']);
  });

  it('trims the Peek to its last lines', () => {
    let sessions = applyEvent(new Map(), { type: 'snapshot', sessions: [view()] });
    for (let i = 0; i < PEEK_LINES + 5; i++) {
      sessions = applyEvent(sessions, { type: 'peek', sessionId: 's1', line: line(`l${i}`) });
    }
    const peek = sessions.get('s1')?.peek ?? [];
    expect(peek).toHaveLength(PEEK_LINES);
    expect(peek[0]?.text).toBe('l5');
  });

  it('drops a Session', () => {
    const next = applyEvent(new Map([['s1', view()]]), { type: 'drop', sessionId: 's1' });
    expect(next.size).toBe(0);
  });
});
