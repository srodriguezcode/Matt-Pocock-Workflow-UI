import { describe, expect, it } from 'vitest';
import type { AnswerRequest } from '@contract/session';
import { askDecision, readAnswerRequest, readAskQuestions, rewakeText } from './answer.ts';
import { REPLY_FRAME, ROUND_FRAME } from './constants.ts';

const input = {
  questions: [
    {
      question: 'Which db?',
      header: 'DB',
      options: [
        { label: 'pg', description: 'Postgres' },
        { label: 'lite', description: 'SQLite' },
      ],
      multiSelect: false,
    },
  ],
};

const target = { sessionId: 's', questionId: 'q' };

describe('readAskQuestions', () => {
  it('reads a tool input', () => {
    expect(readAskQuestions(input)).toEqual(input.questions);
  });

  it('is null when malformed', () => {
    expect(readAskQuestions(null)).toBeNull();
    expect(readAskQuestions({})).toBeNull();
    expect(readAskQuestions({ questions: [] })).toBeNull();
    expect(readAskQuestions({ questions: [{ question: 'x' }] })).toBeNull();
    expect(readAskQuestions({ questions: [{ question: 'x', options: [{}] }] })).toBeNull();
  });
});

describe('askDecision', () => {
  const decide = (answers: Parameters<typeof askDecision>[1]) =>
    askDecision(input, answers) as {
      hookSpecificOutput: {
        hookEventName: string;
        decision: { behavior: string; updatedInput: unknown };
      };
    };

  it('allows with the answers merged into the input', () => {
    const out = decide([{ question: 'Which db?', selected: ['pg', 'lite'], other: 'mongo' }]);
    expect(out.hookSpecificOutput.hookEventName).toBe('PermissionRequest');
    expect(out.hookSpecificOutput.decision).toEqual({
      behavior: 'allow',
      updatedInput: { ...input, answers: { 'Which db?': 'pg, lite, mongo' } },
    });
  });

  it('leaves out a question with nothing answered', () => {
    const out = decide([{ question: 'Which db?', selected: [], other: '  ' }]);
    expect(out.hookSpecificOutput.decision.updatedInput).toEqual({ ...input, answers: {} });
  });
});

describe('rewakeText', () => {
  it('frames a round, free text winning over the key', () => {
    const answer: AnswerRequest = {
      ...target,
      kind: 'round',
      answers: [
        { number: '1', key: 'a', text: null },
        { number: '2', key: 'a', text: null },
        { number: '3', key: 'c', text: '' },
        { number: '4', key: 'b', text: ' my own ' },
      ],
    };
    expect(rewakeText(answer)).toBe(`${ROUND_FRAME}1 a / 2 a / 3 c / 4 my own`);
  });

  it('frames a reply and drops a blank one', () => {
    expect(rewakeText({ ...target, kind: 'reply', text: ' go on ' })).toBe(`${REPLY_FRAME}go on`);
    expect(rewakeText({ ...target, kind: 'reply', text: '  ' })).toBeNull();
  });

  it('has no text for an ask', () => {
    expect(rewakeText({ ...target, kind: 'ask', answers: [] })).toBeNull();
  });
});

describe('readAnswerRequest', () => {
  it('reads each kind', () => {
    const ask = {
      ...target,
      kind: 'ask',
      answers: [{ question: 'Q', selected: ['a'], other: null }],
    };
    const round = { ...target, kind: 'round', answers: [{ number: '1', key: null, text: 'x' }] };
    const reply = { ...target, kind: 'reply', text: 'hi' };
    for (const body of [ask, round, reply]) expect(readAnswerRequest(body)).toEqual(body);
  });

  it('reads the Delivery of a reply or a round, and refuses an unknown one', () => {
    const reply = { ...target, kind: 'reply', text: 'hi', delivery: 'typed' };
    const round = { ...target, kind: 'round', answers: [], delivery: 'hook' };
    expect(readAnswerRequest(reply)).toEqual(reply);
    expect(readAnswerRequest(round)).toEqual(round);
    expect(readAnswerRequest({ ...reply, delivery: 'pigeon' })).toBeNull();
  });

  it('drops fields the kind does not carry', () => {
    expect(readAnswerRequest({ ...target, kind: 'reply', text: 'hi', extra: 1 })).toEqual({
      ...target,
      kind: 'reply',
      text: 'hi',
    });
  });

  it('rejects a body malformed for its kind', () => {
    const bad = [
      null,
      { kind: 'reply', text: 'hi' },
      { ...target, kind: 'other', text: 'hi' },
      { ...target, kind: 'reply' },
      { ...target, kind: 'reply', text: 3 },
      { ...target, kind: 'ask' },
      { ...target, kind: 'ask', answers: [{ question: 'Q', selected: 'a', other: null }] },
      { ...target, kind: 'ask', answers: [{ question: 'Q', selected: [1], other: null }] },
      { ...target, kind: 'ask', answers: [{ question: 'Q', selected: [] }] },
      { ...target, kind: 'ask', answers: [null] },
      { ...target, kind: 'round', answers: [{ number: 1, key: null, text: null }] },
      { ...target, kind: 'round', answers: [{ number: '1', key: 2, text: null }] },
      { ...target, kind: 'round', answers: [{ number: '1', key: null }] },
    ];
    for (const body of bad) expect(readAnswerRequest(body)).toBeNull();
  });
});
