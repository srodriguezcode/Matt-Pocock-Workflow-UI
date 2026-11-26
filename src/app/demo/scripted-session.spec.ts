import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnswerRequest, SessionEvent, SessionView } from '@contract/session';
import { ScriptedSession } from './scripted-session';

const answerTo = (view: SessionView): AnswerRequest => ({
  sessionId: view.sessionId,
  questionId: view.question?.id ?? '',
  kind: 'round',
  answers: [
    { number: '1', key: 'b', text: null },
    { number: '2', key: 'a', text: null },
  ],
});

function watch(session: ScriptedSession) {
  const events: SessionEvent[] = [];
  const close = session.open((event) => events.push(event));
  const current = (): SessionView => {
    const snapshot = events.find((e) => e.type === 'snapshot');
    const view = snapshot?.type === 'snapshot' ? snapshot.sessions[0] : undefined;
    if (!view) throw new Error('no Session');
    return events.reduce<SessionView>((acc, e) => {
      if (e.type === 'status') return { ...e.session, peek: acc.peek };
      if (e.type === 'peek') return { ...acc, peek: [...acc.peek, e.line] };
      return acc;
    }, view);
  };
  return { events, close, current };
}

describe('ScriptedSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens with a snapshot of a Working Session that cannot take typed Delivery', () => {
    const { events, close } = watch(new ScriptedSession());

    expect(events[0]).toMatchObject({
      type: 'snapshot',
      sessions: [{ state: 'working', typeable: false, target: { kind: 'decision' } }],
    });
    close();
  });

  it('adds a Peek line every few seconds, then asks the round', () => {
    const { current, close } = watch(new ScriptedSession());

    vi.advanceTimersByTime(3000);
    expect(current().peek.map((l) => l.text)).toEqual([
      '/wayfinder /Users/ana-reyes/code/shelf/.scratch/lend-books/map.md /Users/ana-reyes/code/shelf/.scratch/lend-books/issues/03-late-loan.md',
      'Read: /Users/ana-reyes/code/shelf/GLOSSARY.md',
    ]);

    vi.advanceTimersByTime(12000);
    const view = current();
    expect(view.state).toBe('asking');
    expect(view.peek.at(-1)?.kind).toBe('turn-end');
    expect(view.question).toMatchObject({ kind: 'round' });
    if (view.question?.kind === 'round') {
      expect(view.question.questions.map((q) => q.recommendedKey)).toEqual(['b', 'a']);
    }
    close();
  });

  it('waits for the visitor with no time limit', () => {
    const { current, close } = watch(new ScriptedSession());
    vi.advanceTimersByTime(15000);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(current().state).toBe('asking');
    close();
  });

  it('continues after the answer, ends, drops, then starts a new loop', async () => {
    const session = new ScriptedSession();
    const { events, current, close } = watch(session);
    vi.advanceTimersByTime(15000);
    const first = current();

    await expect(session.answer(answerTo(first))).resolves.toEqual({ code: 'sent' });
    expect(current()).toMatchObject({ state: 'working', question: null });

    vi.advanceTimersByTime(9000);
    expect(
      current()
        .peek.slice(-3)
        .map((l) => l.tool ?? l.kind),
    ).toEqual(['Edit', 'Bash', 'turn-end']);

    vi.advanceTimersByTime(1000);
    expect(current().state).toBe('ended');

    vi.advanceTimersByTime(5000);
    expect(events.at(-2)).toEqual({ type: 'drop', sessionId: first.sessionId });
    expect(events.at(-1)).toMatchObject({
      type: 'status',
      session: { state: 'working', sessionId: 'demo-session-2' },
    });

    vi.advanceTimersByTime(16000);
    expect(current().question?.id).toBe('demo-question-2');
    close();
  });

  it('shows the answer as the server words it, free text over the key', async () => {
    const session = new ScriptedSession();
    const { current, close } = watch(session);
    vi.advanceTimersByTime(15000);
    const asked = current();
    const request = answerTo(asked);
    if (request.kind === 'round')
      request.answers[1] = { number: '2', key: 'a', text: 'Ask me later' };

    await session.answer(request);

    expect(current().peek.at(-1)?.text).toBe('1 b / 2 Ask me later');
    close();
  });

  it('answers gone for a stale question', async () => {
    const session = new ScriptedSession();
    const { current, close } = watch(session);
    vi.advanceTimersByTime(15000);
    const asked = current();

    await session.answer(answerTo(asked));

    await expect(session.answer(answerTo(asked))).resolves.toEqual({ code: 'gone' });
    close();
  });

  it('stops every timer on close', () => {
    const { events, close } = watch(new ScriptedSession());
    close();
    const seen = events.length;

    vi.advanceTimersByTime(60000);

    expect(events).toHaveLength(seen);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives a late subscriber the current state', () => {
    const session = new ScriptedSession();
    const first = watch(session);
    vi.advanceTimersByTime(15000);

    const late = watch(session);

    expect(late.events[0]).toMatchObject({
      type: 'snapshot',
      sessions: [{ state: 'asking' }],
    });
    first.close();
    late.close();
  });
});
