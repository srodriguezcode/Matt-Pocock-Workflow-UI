import { describe, expect, it } from 'vitest';
import type { PeekLine, SessionView } from '@contract/session';
import { replyHint, turnsOf } from './turns';

const line = (kind: PeekLine['kind'], text: string): PeekLine => ({
  at: '2026-09-30T10:00:00Z',
  kind,
  tool: kind === 'tool' ? 'Bash' : null,
  full: kind === 'tool' ? null : text,
  human: false,
  text,
});

describe('turnsOf', () => {
  it('groups prompt, tools and turn end into turns', () => {
    const turns = turnsOf([
      line('prompt', 'go'),
      line('tool', 'Bash: ls'),
      line('turn-end', 'done'),
      line('prompt', 'more'),
      line('tool', 'Bash: pwd'),
    ]);
    expect(turns.map((t) => [t.prompt?.text, t.tools.length, t.end?.text])).toEqual([
      ['go', 1, 'done'],
      ['more', 1, undefined],
    ]);
  });

  it('opens a turn without a prompt when Peek starts mid-turn or a wake follows a turn end', () => {
    const turns = turnsOf([
      line('tool', 'Bash: ls'),
      line('turn-end', 'a'),
      line('tool', 'Read: x'),
    ]);
    expect(turns.map((t) => [t.prompt, t.tools.length, t.end?.text ?? null])).toEqual([
      [null, 1, 'a'],
      [null, 1, null],
    ]);
  });
});

describe('replyHint', () => {
  const session = (over: Partial<SessionView>): SessionView => ({
    sessionId: 's',
    repo: '/r',
    target: { kind: 'ticket', id: '1' },
    state: 'working',
    waiting: null,
    since: '',
    startedAt: '',
    question: null,
    note: null,
    typeable: false,
    peek: [],
    ...over,
  });

  it('opens the box only on a turn end the board can reply to', () => {
    const reply = { kind: 'reply' as const, id: 'q', message: 'm' };
    expect(replyHint(session({ state: 'waiting', waiting: 'turn-end', question: reply }))).toBe(
      null,
    );
    expect(
      replyHint(session({ state: 'asking', question: { kind: 'ask', id: 'q', questions: [] } })),
    ).toBe('form');
    expect(replyHint(session({ state: 'waiting', waiting: 'permission-prompt' }))).toBe(
      'permission',
    );
    expect(replyHint(session({ state: 'working' }))).toBe('working');
    expect(replyHint(session({ state: 'ended' }))).toBe('none');
  });
});
