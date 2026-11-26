import { describe, expect, it } from 'vitest';
import type { SessionState, SessionStatus, SessionView } from '@contract/session';
import type { Sky } from '@contract/sky';
import { attentionCount } from './attention-count';
import { recordEnded, triggersReread, visibleSessions } from './visibility';

const claim = { holder: 'me', since: '2026-01-01', ageDays: 0, heldWeek: false, mine: true };
const skyWith = (gate: string, claimed: boolean): Sky =>
  ({
    tickets: [{ id: '7', gate, claim: claimed ? claim : null }],
    systems: [],
  }) as unknown as Sky;

const session = (
  state: SessionState,
  since = '2026-01-01T00:00:00Z',
  extra: Partial<SessionView> = {},
): SessionView => ({
  sessionId: 's1',
  repo: '/r',
  target: { kind: 'ticket', id: '7' },
  state,
  waiting: null,
  since,
  startedAt: since,
  question: null,
  note: null,
  typeable: false,
  peek: [],
  ...extra,
});

describe('Ended and Lost retention', () => {
  it('keeps an Ended Session until the star changes', () => {
    const ended = session('ended');
    const under = recordEnded(new Map(), [ended], skyWith('in-flight', true), '/r');
    expect(visibleSessions([ended], skyWith('in-flight', true), under)).toHaveLength(1);
    expect(visibleSessions([ended], skyWith('clear', false), under)).toHaveLength(0);
  });

  it('keeps the first fingerprint when the sky moves on', () => {
    const ended = session('ended');
    const first = recordEnded(new Map(), [ended], skyWith('in-flight', true), '/r');
    expect(recordEnded(first, [ended], skyWith('clear', false), '/r')).toBe(first);
  });

  it('forgets a Session that left', () => {
    const under = new Map([['s1', 'x']]);
    expect(recordEnded(under, [], skyWith('clear', false), '/r').size).toBe(0);
  });

  it('keeps a Lost Session while its Claim stands', () => {
    const lost = session('lost');
    expect(visibleSessions([lost], skyWith('in-flight', true), new Map())).toHaveLength(1);
    expect(visibleSessions([lost], skyWith('clear', false), new Map())).toHaveLength(0);
  });

  const mapSession = session('lost', undefined, { target: { kind: 'map', id: 'map' } });
  const mapSky = (decisionClaimed: boolean): Sky =>
    ({
      mapId: 'map',
      tickets: [
        {
          id: '9',
          kind: 'decision',
          gate: 'in-flight',
          claim: decisionClaimed ? { ...claim, since: '2026-01-02T00:00:00Z' } : null,
        },
      ],
      systems: [],
    }) as unknown as Sky;

  it('keeps a Lost Map Session while the Map is on the sky', () => {
    expect(visibleSessions([mapSession], mapSky(false), new Map())).toHaveLength(1);
    expect(
      visibleSessions([mapSession], { ...mapSky(false), mapId: null }, new Map()),
    ).toHaveLength(0);
  });

  it('keeps a Lost Map Session on the Decision ticket it moved to while that Claim stands', () => {
    expect(visibleSessions([mapSession], mapSky(true), new Map())).toHaveLength(1);
  });
});

describe('triggersReread', () => {
  const next = (state: SessionState, since: string): SessionStatus =>
    session(state, since, { waiting: state === 'waiting' ? 'turn-end' : null });

  it('fires on a turn end, Ended and Lost', () => {
    const working = session('working');
    const at = '2026-01-01T00:05:00Z';
    const turnEnd = session('waiting', at, { waiting: 'turn-end' });
    const round = session('asking', at, {
      question: { kind: 'round', id: 'q', message: '', questions: [] },
    });
    for (const status of [turnEnd, round, session('ended', at), session('lost', at)]) {
      expect(triggersReread(working, status)).toBe(true);
    }
  });

  it('ignores a permission prompt and an AskUserQuestion', () => {
    const at = '2026-01-01T00:05:00Z';
    const prompt = session('waiting', at, { waiting: 'permission-prompt' });
    const ask = session('asking', at, { question: { kind: 'ask', id: 'q', questions: [] } });
    expect(triggersReread(session('working'), prompt)).toBe(false);
    expect(triggersReread(session('working'), ask)).toBe(false);
  });

  const turnEndWaiting = session('waiting', undefined, { waiting: 'turn-end' });

  it('ignores a move to Working and a repeat of the same state', () => {
    expect(triggersReread(session('waiting'), next('working', '2026-01-01T00:05:00Z'))).toBe(false);
    expect(triggersReread(turnEndWaiting, next('waiting', '2026-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('attentionCount', () => {
  it('counts Asking and Waiting only', () => {
    const states: SessionState[] = ['working', 'asking', 'waiting', 'ended', 'lost'];
    expect(attentionCount(states.map((state) => session(state)))).toBe(2);
  });
});
