import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnswerRequest } from '@contract/session';
import { testHub } from '#server/testing/fake-link.ts';
import { askDecision } from './answer.ts';
import type { TypeFailure } from './hub.ts';
import { HOLD_MARGIN_S, HOLD_TIMEOUT_S, REPLY_FRAME, ROUND_FRAME } from './constants.ts';
import type { HookEvent, StopEvent } from './hook-event.ts';
import { encodeTarget } from './target.ts';

const header = encodeTarget({ repo: '/r', target: { kind: 'ticket', id: '7' } });
const base = { session_id: 's1', cwd: '/r' };
const askInput = {
  questions: [
    {
      question: 'Which db?',
      header: 'DB',
      options: [{ label: 'pg', description: '' }],
      multiSelect: false,
    },
  ],
};
const ask: HookEvent = {
  ...base,
  hook_event_name: 'PermissionRequest',
  tool_name: 'AskUserQuestion',
  tool_input: askInput,
};
const round =
  '❓ **Q1 - Scope**: What?\n(a) all\n(b) some\n➡️ (b) because\n\n❓ **Q2 - Name**: free\n➡️ call it X';

function stop(message: string): StopEvent {
  return { ...base, hook_event_name: 'Stop', last_assistant_message: message };
}

type Body = AnswerRequest extends infer R
  ? R extends AnswerRequest
    ? Omit<R, 'sessionId' | 'questionId'>
    : never
  : never;

function setup() {
  const hub = testHub({
    readAgents: async () => [{ sessionId: 's1', pid: 1, cwd: '/r', busy: false }],
  });
  const open = new AbortController();
  const status = () => hub.snapshot()[0]!;
  let id = '';
  const answer = (rest: Body) => {
    id = status().question?.id ?? id;
    return hub.answer({ sessionId: 's1', questionId: id, ...rest } as AnswerRequest);
  };
  return { hub, signal: open.signal, abort: () => open.abort(), status, answer };
}

afterEach(() => vi.useRealTimers());

describe('AskUserQuestion hold', () => {
  it('makes the Session Asking and answers the hook from the board', async () => {
    const { hub, signal, status, answer } = setup();
    const held = hub.hook(header, ask, signal);
    expect(status().state).toBe('asking');
    expect(status().question).toMatchObject({ kind: 'ask', questions: askInput.questions });
    const answers = [{ question: 'Which db?', selected: ['pg'], other: null }];
    expect(await answer({ kind: 'ask', answers })).toEqual({ code: 'sent' });
    expect(await held).toEqual(askDecision(askInput, answers));
    expect(status().question).toBeNull();
    expect(await answer({ kind: 'ask', answers })).toEqual({ code: 'gone' });
  });

  it('gives a second submit gone', async () => {
    const { hub, signal, status, answer } = setup();
    const held = hub.hook(header, ask, signal);
    const id = status().question!.id;
    const answers = [{ question: 'Which db?', selected: ['pg'], other: null }];
    expect(await hub.answer({ sessionId: 's1', questionId: id, kind: 'ask', answers })).toEqual({
      code: 'sent',
    });
    expect(await hub.answer({ sessionId: 's1', questionId: id, kind: 'ask', answers })).toEqual({
      code: 'gone',
    });
    await held;
    expect(answer).toBeDefined();
  });

  it('drops the form when the terminal answers', async () => {
    const { hub, signal, status } = setup();
    const held = hub.hook(header, ask, signal);
    await hub.hook(
      header,
      {
        ...base,
        hook_event_name: 'PostToolUse',
        tool_name: 'AskUserQuestion',
        tool_input: askInput,
      },
      signal,
    );
    expect(await held).toEqual({});
    expect(status().question).toBeNull();
  });

  it('falls back to the terminal with a note on timeout', async () => {
    vi.useFakeTimers();
    const { hub, signal, status } = setup();
    const held = hub.hook(header, ask, signal);
    await vi.advanceTimersByTimeAsync((HOLD_TIMEOUT_S - HOLD_MARGIN_S) * 1000);
    expect(await held).toEqual({});
    expect(status().question).toBeNull();
    expect(status().note).toEqual({ code: 'timed-out' });
  });

  it('drops when the hook aborts', async () => {
    const { hub, signal, abort, status } = setup();
    const held = hub.hook(header, ask, signal);
    abort();
    expect(await held).toEqual({});
    expect(status().question).toBeNull();
  });
});

describe('Stop hold', () => {
  it('makes a round Asking and wakes with the framed answers', async () => {
    const { hub, signal, status, answer } = setup();
    const held = hub.rewake(header, stop(round), signal);
    expect(status().state).toBe('asking');
    expect(status().question).toMatchObject({ kind: 'round', message: round });
    const question = status().question;
    expect(question?.kind === 'round' && question.questions.map((q) => q.number)).toEqual([
      '1',
      '2',
    ]);
    expect(
      await answer({
        kind: 'round',
        answers: [
          { number: '1', key: 'b', text: null },
          { number: '2', key: null, text: 'X' },
        ],
      }),
    ).toEqual({ code: 'sent' });
    expect(await held).toBe(`${ROUND_FRAME}1 b / 2 X`);
  });

  it('keeps a plain message Waiting with the reply box and wakes on a reply', async () => {
    const { hub, signal, status, answer } = setup();
    const held = hub.rewake(header, stop('All done.'), signal);
    expect(status()).toMatchObject({ state: 'waiting', waiting: 'turn-end' });
    expect(status().question).toMatchObject({ kind: 'reply', message: 'All done.' });
    expect(await answer({ kind: 'reply', text: ' go on ' })).toEqual({ code: 'sent' });
    expect(await held).toBe(`${REPLY_FRAME}go on`);
    expect(await answer({ kind: 'reply', text: 'again' })).toEqual({ code: 'gone' });
  });

  it('leaves the Session idle when the reply is blank', async () => {
    const { hub, signal, answer } = setup();
    const held = hub.rewake(header, stop('All done.'), signal);
    await answer({ kind: 'reply', text: '  ' });
    expect(await held).toBeNull();
  });

  it('drops the box when the terminal replies without waking', async () => {
    const { hub, signal, status } = setup();
    const held = hub.rewake(header, stop('All done.'), signal);
    await hub.hook(
      header,
      { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'typed' },
      signal,
    );
    expect(await held).toBeNull();
    expect(status().question).toBeNull();
  });

  it('does not read a wake prompt as a terminal answer', async () => {
    const { hub, signal, status } = setup();
    const held = hub.rewake(header, stop('All done.'), signal);
    await hub.hook(
      header,
      {
        ...base,
        hook_event_name: 'UserPromptSubmit',
        prompt: '<task-notification>\nhook</task-notification>',
      },
      signal,
    );
    expect(status().question).toMatchObject({ kind: 'reply' });
    await hub.answer({
      sessionId: 's1',
      questionId: status().question!.id,
      kind: 'reply',
      text: 'hi',
    });
    expect(await held).toBe(`${REPLY_FRAME}hi`);
  });

  it("shows the board's answer in Peek as the prompt, not the wake", async () => {
    const { hub, signal, status, answer } = setup();
    const held = hub.rewake(header, stop('Continue?'), signal);
    await answer({ kind: 'reply', text: 'yes please' });
    await held;
    await hub.hook(
      header,
      {
        ...base,
        hook_event_name: 'UserPromptSubmit',
        prompt: '<task-notification>x</task-notification>',
      },
      signal,
    );
    const prompts = status()
      .peek.filter((l) => l.kind === 'prompt')
      .map((l) => l.text);
    expect(prompts).toEqual(['yes please']);
  });

  it('shows a round answered on the board as its composed reply', async () => {
    const { hub, signal, status, answer } = setup();
    const held = hub.rewake(header, stop(round), signal);
    await answer({
      kind: 'round',
      answers: [
        { number: '1', key: 'b', text: null },
        { number: '2', key: null, text: 'Miso' },
      ],
    });
    await held;
    expect(status().peek.at(-1)).toMatchObject({ kind: 'prompt', text: '1 b / 2 Miso' });
  });

  it('shows the timed-out note and lets the Session idle', async () => {
    vi.useFakeTimers();
    const { hub, signal, status } = setup();
    const held = hub.rewake(header, stop('All done.'), signal);
    await vi.advanceTimersByTimeAsync((HOLD_TIMEOUT_S - HOLD_MARGIN_S) * 1000);
    expect(await held).toBeNull();
    expect(status().note).toEqual({ code: 'timed-out' });
  });

  it("times a re-posted hold out at the hook's own deadline, with the note", async () => {
    vi.useFakeTimers();
    const { hub, signal, status } = setup();
    const now = new Date('2026-09-30T10:00:00Z').getTime();
    const held = hub.rewake(header, stop('All done.'), signal, now - 20 * 60_000);
    const left = (HOLD_TIMEOUT_S - HOLD_MARGIN_S) * 1000 - 20 * 60_000;
    await vi.advanceTimersByTimeAsync(left - 1);
    expect(status().question).toMatchObject({ kind: 'reply' });
    await vi.advanceTimersByTimeAsync(1);
    expect(await held).toBeNull();
    expect(status().note).toEqual({ code: 'timed-out' });
  });

  it("times out at once when the hook's window has already passed", async () => {
    vi.useFakeTimers();
    const { hub, signal, status } = setup();
    const now = new Date('2026-09-30T10:00:00Z').getTime();
    const held = hub.rewake(header, stop('All done.'), signal, now - HOLD_TIMEOUT_S * 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(await held).toBeNull();
    expect(status().note).toEqual({ code: 'timed-out' });
  });
});

describe('typed Delivery', () => {
  const launch = {
    repo: '/r',
    target: { kind: 'ticket' as const, id: '7' },
    cwd: '/r.worktrees/7',
    terminal: 'TAB-1',
  };

  function typing(result: TypeFailure | null = null) {
    const typed: [string, string][] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const hub = testHub({
      readAgents: async () => [{ sessionId: 's1', pid: 1, cwd: '/r', busy: false }],
      typeInto: async (terminal, text) => {
        typed.push([terminal, text]);
        await gate;
        return result;
      },
    });
    const signal = new AbortController().signal;
    const status = () => hub.snapshot()[0]!;
    const request = (rest: Body) =>
      ({ sessionId: 's1', questionId: status().question!.id, ...rest }) as Exclude<
        AnswerRequest,
        { kind: 'ask' }
      >;
    return { hub, typed, release, signal, status, request };
  }

  it("is offered only once the board knows the Session's tab", async () => {
    const { hub, signal, status } = typing();
    void hub.rewake(header, stop('All done.'), signal);
    expect(status().typeable).toBe(false);
    hub.launched(launch);
    expect(status().typeable).toBe(true);
  });

  it('types the bare answer and ends the rewake hook with no wake', async () => {
    const { hub, typed, release, signal, request } = typing();
    hub.launched(launch);
    const held = hub.rewake(header, stop('Continue?'), signal);
    const typedReply = request({ kind: 'reply', text: ' line one\nline two ', delivery: 'typed' });
    const sent = hub.answer(typedReply);
    release();
    expect(await sent).toEqual({ code: 'sent' });
    expect(typed).toEqual([['TAB-1', 'line one\nline two']]);
    expect(await held).toBeNull();
    expect(await hub.answer(typedReply)).toEqual({ code: 'gone' });
  });

  it('types a round as its composed reply, without the frame', async () => {
    const { hub, typed, release, signal, request } = typing();
    hub.launched(launch);
    const held = hub.rewake(header, stop(round), signal);
    const answers = [
      { number: '1', key: 'b', text: null },
      { number: '2', key: null, text: 'X' },
    ];
    const sent = hub.answer(request({ kind: 'round', answers, delivery: 'typed' }));
    release();
    expect(await sent).toEqual({ code: 'sent' });
    expect(typed).toEqual([['TAB-1', '1 b / 2 X']]);
    expect(await held).toBeNull();
  });

  it('sends a typed ask answer by hook even with a known terminal', async () => {
    const typed: string[] = [];
    const hub = testHub({
      readAgents: async () => [{ sessionId: 's1', pid: 1, cwd: '/r', busy: false }],
      typeInto: async (terminal) => {
        typed.push(terminal);
        return null;
      },
    });
    hub.launched(launch);
    const held = hub.hook(header, ask, new AbortController().signal);
    const id = hub.snapshot()[0]!.question!.id;
    const answers = [{ question: 'Which db?', selected: ['pg'], other: null }];
    const sent = await hub.answer({
      sessionId: 's1',
      questionId: id,
      kind: 'ask',
      answers,
      delivery: 'typed',
    });
    expect(sent).toEqual({ code: 'sent' });
    expect(typed).toEqual([]);
    expect(await held).toEqual(askDecision(askInput, answers));
  });

  it('refuses a second answer while the first is typing', async () => {
    const { hub, release, signal, request } = typing();
    hub.launched(launch);
    void hub.rewake(header, stop('Continue?'), signal);
    const first = request({ kind: 'reply', text: 'one', delivery: 'typed' });
    const sent = hub.answer(first);
    expect(await hub.answer({ ...first, delivery: 'hook' } as AnswerRequest)).toEqual({
      code: 'gone',
    });
    expect(await Promise.race([hub.answer(first), Promise.resolve('pending')])).toEqual({
      code: 'gone',
    });
    release();
    await sent;
  });

  it('keeps the question open when typing fails', async () => {
    const { hub, release, signal, status, request } = typing({ code: 'tab-closed' });
    hub.launched(launch);
    void hub.rewake(header, stop('Continue?'), signal);
    const sent = hub.answer(request({ kind: 'reply', text: 'go', delivery: 'typed' }));
    release();
    expect(await sent).toEqual({ code: 'tab-closed' });
    expect(status().question).toMatchObject({ kind: 'reply' });
    expect(await hub.answer(request({ kind: 'reply', text: 'go' }))).toEqual({ code: 'sent' });
  });

  it('is gone once the terminal answered first', async () => {
    const { hub, typed, signal, request } = typing();
    hub.launched(launch);
    void hub.rewake(header, stop('Continue?'), signal);
    const late = request({ kind: 'reply', text: 'go', delivery: 'typed' });
    await hub.hook(
      header,
      { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'typed' },
      signal,
    );
    expect(await hub.answer(late)).toEqual({ code: 'gone' });
    expect(typed).toEqual([]);
  });

  it('goes by hook without a known tab', async () => {
    const { hub, typed, signal, request } = typing();
    const held = hub.rewake(header, stop('Continue?'), signal);
    expect(await hub.answer(request({ kind: 'reply', text: 'go', delivery: 'typed' }))).toEqual({
      code: 'sent',
    });
    expect(await held).toBe(`${REPLY_FRAME}go`);
    expect(typed).toEqual([]);
  });

  it('adds no board line to Peek: the typed prompt shows itself, as human', async () => {
    const { hub, release, signal, status, request } = typing();
    hub.launched(launch);
    void hub.rewake(header, stop('Continue?'), signal);
    const sent = hub.answer(request({ kind: 'reply', text: 'go on', delivery: 'typed' }));
    release();
    await sent;
    await hub.hook(
      header,
      { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'go on' },
      signal,
    );
    const prompts = status().peek.filter((l) => l.kind === 'prompt');
    expect(prompts.map((l) => [l.text, l.human])).toEqual([['go on', true]]);
  });

  it('shows a hook answer in Peek as no Human prompt', async () => {
    const { hub, signal, status, request } = typing();
    const held = hub.rewake(header, stop('Continue?'), signal);
    await hub.answer(request({ kind: 'reply', text: 'go on' }));
    await held;
    expect(status().peek.at(-1)).toMatchObject({ kind: 'prompt', text: 'go on', human: false });
  });
});
