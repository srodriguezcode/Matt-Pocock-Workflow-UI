import { describe, expect, it } from 'vitest';
import type { SessionView } from '@contract/session';
import type { Sky } from '@contract/sky';
import { englishMessages } from '@app/i18n/messages.en';
import type { Placed } from '@app/session/place';
import { sessionLine } from './session-view';

const text = englishMessages.board.session;
const sky = { tickets: [], systems: [{ id: '5', handle: '#5' }] } as unknown as Sky;
const since = '2026-01-01T00:00:00Z';
const at = (minutes: number) => Date.parse(since) + minutes * 60_000;

const session = (over: Partial<SessionView> = {}): SessionView => ({
  sessionId: 's1',
  repo: '/r',
  target: { kind: 'ticket', id: '7' },
  state: 'working',
  waiting: null,
  since,
  startedAt: since,
  question: null,
  note: null,
  typeable: false,
  peek: [],
  ...over,
});
const placed = (over: Partial<SessionView> = {}, sharedFrom: string | null = null): Placed => ({
  session: session(over),
  sharedFrom,
});

describe('the Session line', () => {
  it('shows the state and how long it has held', () => {
    expect(sessionLine(placed(), sky, at(12), false, text)).toEqual({
      line: 'Working · 12 min',
      notes: [],
      shared: false,
    });
  });

  it('sends a permission prompt to the terminal', () => {
    const view = sessionLine(
      placed({ state: 'waiting', waiting: 'permission-prompt' }),
      sky,
      at(1),
      false,
      text,
    );
    expect(view.notes).toEqual(['Waiting on a permission prompt. Answer in the terminal.']);
  });

  it('words a timed-out hold', () => {
    const view = sessionLine(
      placed({ state: 'waiting', note: { code: 'timed-out' } }),
      sky,
      at(1),
      false,
      text,
    );
    expect(view.notes).toEqual([
      'The question waited too long for the board. Answer it in the terminal.',
    ]);
  });

  it('points a Lost Session to Release or the terminal', () => {
    const view = sessionLine(placed({ state: 'lost' }), sky, at(3), false, text);
    expect(view.line).toBe('Lost · 3 min');
    expect(view.notes).toEqual([
      'Its process is gone. Release the claim, or pick the work up in the terminal.',
    ]);
  });

  it('notes an answer that came back gone', () => {
    const view = sessionLine(placed(), sky, at(1), true, text);
    expect(view.notes).toEqual(['Already answered, on another screen or in the terminal.']);
  });

  it('names the shared Session on a child ticket', () => {
    expect(sessionLine(placed({}, '5'), sky, at(1), false, text)).toEqual({
      line: null,
      notes: ['Shares the session started on #5'],
      shared: true,
    });
  });
});
