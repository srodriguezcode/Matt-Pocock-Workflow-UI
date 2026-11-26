import { describe, expect, it } from 'vitest';
import type { AskQuestion, RoundQuestion } from '@contract/session';
import {
  askComplete,
  askRequest,
  emptyAskFields,
  pickKey,
  pickOption,
  replyRequest,
  restoreAskFields,
  restoreReply,
  restoreRoundFields,
  roundComplete,
  roundDefaults,
  roundRequest,
  typeOther,
  typeText,
} from './answers';

const asks: AskQuestion[] = [
  {
    question: 'Which store?',
    header: 'Store',
    multiSelect: false,
    options: [
      { label: 'SQLite', description: 'file' },
      { label: 'Postgres', description: 'server' },
    ],
  },
  {
    question: 'Which extras?',
    header: 'Extras',
    multiSelect: true,
    options: [
      { label: 'Cache', description: '' },
      { label: 'Queue', description: '' },
    ],
  },
];

const rounds: RoundQuestion[] = [
  {
    number: '1',
    title: 'Store',
    body: '',
    options: [
      { key: 'a', label: 'SQLite', details: [] },
      { key: 'b', label: 'Postgres', details: [] },
    ],
    recommendation: 'a, it is a file',
    recommendedKey: 'a',
  },
  {
    number: '2',
    title: 'Naming',
    body: '',
    options: [],
    recommendation: 'Call it Peek',
    recommendedKey: null,
  },
];

describe('answering an AskUserQuestion', () => {
  it('sends the picked labels and the Other text per question', () => {
    let fields = emptyAskFields(asks);
    fields[0] = pickOption(fields[0]!, 'SQLite', false);
    fields[1] = pickOption(fields[1]!, 'Cache', true);
    fields[1] = pickOption(fields[1]!, 'Queue', true);
    fields[1] = typeOther(fields[1]!, ' more ', true);
    expect(askRequest('s1', 'q1', asks, fields)).toEqual({
      kind: 'ask',
      sessionId: 's1',
      questionId: 'q1',
      answers: [
        { question: 'Which store?', selected: ['SQLite'], other: null },
        { question: 'Which extras?', selected: ['Cache', 'Queue'], other: 'more' },
      ],
      delivery: 'hook',
    });
  });

  it('unticks a multi-select option picked twice', () => {
    const once = pickOption({ selected: [], other: '' }, 'Cache', true);
    expect(pickOption(once, 'Cache', true).selected).toEqual([]);
  });

  it('lets Other and a single-select pick replace each other', () => {
    const picked = pickOption({ selected: [], other: '' }, 'SQLite', false);
    expect(typeOther(picked, 'Mongo', false)).toEqual({ selected: [], other: 'Mongo' });
    expect(pickOption({ selected: [], other: 'Mongo' }, 'SQLite', false).other).toBe('');
  });

  it('holds the send until every question has an answer', () => {
    const fields = emptyAskFields(asks);
    expect(askComplete(fields)).toBe(false);
    fields[0] = pickOption(fields[0]!, 'SQLite', false);
    fields[1] = typeOther(fields[1]!, 'none', true);
    expect(askComplete(fields)).toBe(true);
  });
});

describe('answering a grilling round', () => {
  it('prefills the recommended key, or the recommendation as free text without one', () => {
    expect(roundDefaults(rounds)).toEqual([
      { key: 'a', text: '' },
      { key: null, text: 'Call it Peek' },
    ]);
  });

  it('sends the key, or the text with a null key when free text wins', () => {
    const fields = [pickKey('b'), typeText('  My own ')];
    expect(roundRequest('s1', 'q1', rounds, fields)).toEqual({
      kind: 'round',
      sessionId: 's1',
      questionId: 'q1',
      answers: [
        { number: '1', key: 'b', text: null },
        { number: '2', key: null, text: 'My own' },
      ],
      delivery: 'hook',
    });
  });

  it('cannot send a question left with neither key nor text', () => {
    expect(roundComplete(roundDefaults(rounds))).toBe(true);
    expect(roundComplete([pickKey('a'), typeText('  ')])).toBe(false);
  });
});

describe('replying to a Waiting Session', () => {
  it('trims the text and goes by hook unless told otherwise', () => {
    expect(replyRequest('s1', 'q1', ' go on \n')).toEqual({
      kind: 'reply',
      sessionId: 's1',
      questionId: 'q1',
      text: 'go on',
      delivery: 'hook',
    });
    expect(replyRequest('s1', 'q1', 'go', 'typed')).toMatchObject({ delivery: 'typed' });
  });
});

describe('restoring a Draft', () => {
  it('shows a saved ask Draft', () => {
    const draft = [
      { selected: ['Postgres'], other: '' },
      { selected: ['Cache'], other: 'more' },
    ];
    expect(restoreAskFields(asks, JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });

  it('starts an ask form empty when the Draft is missing or bad', () => {
    expect(restoreAskFields(asks, undefined)).toEqual(emptyAskFields(asks));
    expect(restoreAskFields(asks, [{ selected: [], other: '' }])).toEqual(emptyAskFields(asks));
    expect(restoreAskFields(asks, [{ selected: [1], other: '' }, {}])).toEqual(
      emptyAskFields(asks),
    );
  });

  it('shows a saved round Draft over the recommendation', () => {
    const draft = [pickKey('b'), typeText('Call it Glance')];
    expect(restoreRoundFields(rounds, draft)).toEqual(draft);
  });

  it('starts a round from the recommendation when the Draft is missing or bad', () => {
    expect(restoreRoundFields(rounds, undefined)).toEqual(roundDefaults(rounds));
    expect(restoreRoundFields(rounds, 'text')).toEqual(roundDefaults(rounds));
    expect(restoreRoundFields(rounds, [{ key: 1, text: '' }, typeText('x')])).toEqual(
      roundDefaults(rounds),
    );
  });

  it('shows a saved reply, or an empty box', () => {
    expect(restoreReply('half a reply')).toBe('half a reply');
    expect(restoreReply(undefined)).toBe('');
    expect(restoreReply(['x'])).toBe('');
  });
});
