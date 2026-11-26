import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import type {
  AnswerRequest,
  AnswerResponse,
  AskQuestion,
  RoundQuestion,
  SessionQuestion,
} from '@contract/session';
import { ApiFailure } from '@app/api/api';
import { englishMessages } from '@app/i18n/messages.en';
import { AnswerNotes } from '@app/session/answer-notes';
import { draftKey, type DraftStore } from '@app/session/drafts';
import { askKind, replyKind, roundKind, type AskField } from './answers';
import { heldAnswer, type AnswerDeps, type AnsweredSession } from './held-answer';

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
];

const rounds: RoundQuestion[] = [
  {
    number: '1',
    title: 'Cache?',
    body: '',
    options: [
      { key: 'a', label: 'Yes', details: [] },
      { key: 'b', label: 'No', details: [] },
    ],
    recommendation: 'Yes',
    recommendedKey: 'a',
  },
];

const ask = (id: string): SessionQuestion => ({ kind: 'ask', id, questions: asks });
const round = (id: string): SessionQuestion => ({
  kind: 'round',
  id,
  message: '',
  questions: rounds,
});
const reply = (id: string): SessionQuestion => ({ kind: 'reply', id, message: '' });

function memoryDrafts(): DraftStore & { stored: Map<string, unknown> } {
  const stored = new Map<string, unknown>();
  return {
    stored,
    load: (sessionId, questionId) => stored.get(draftKey(sessionId, questionId)),
    save: (sessionId, questionId, value) => stored.set(draftKey(sessionId, questionId), value),
    clear: (sessionId, questionId) => stored.delete(draftKey(sessionId, questionId)),
  };
}

function setup(question: SessionQuestion, typeable = true) {
  const sent: AnswerRequest[] = [];
  let respond: () => Promise<AnswerResponse> = async () => ({ code: 'sent' });
  const notes = new AnswerNotes();
  const deps: AnswerDeps = {
    answer: (request) => {
      sent.push(request);
      return respond();
    },
    drafts: memoryDrafts(),
    notes,
    codes: () => englishMessages.board.codes,
  };
  const session = signal<AnsweredSession>({ sessionId: 's1', question, typeable });
  return {
    deps,
    notes,
    sent,
    session,
    respondWith: (next: () => Promise<AnswerResponse>) => (respond = next),
  };
}

const picked: AskField[] = [{ selected: ['Postgres'], other: '' }];

describe('answering the question a Session holds', () => {
  it('brings a Draft back to a new form on the same question', () => {
    const { deps, session } = setup(ask('q1'));
    heldAnswer(deps, session, askKind).edit(picked);

    const again = heldAnswer(deps, session, askKind);

    expect(again.value()).toEqual(picked);
  });

  it('resets the fields and the Delivery on a new question', () => {
    const { deps, session } = setup(round('q1'));
    const answer = heldAnswer(deps, session, roundKind);
    answer.edit([{ key: null, text: 'maybe' }]);
    answer.delivery.picked.set('typed');

    session.set({ sessionId: 's1', question: round('q2'), typeable: true });

    expect(answer.value()).toEqual([{ key: 'a', text: '' }]);
    expect(answer.delivery.picked()).toBe('hook');
  });

  it('sends by hook when the Session is not typeable, whatever was picked', async () => {
    const { deps, session, sent } = setup(reply('q1'), false);
    const answer = heldAnswer(deps, session, replyKind);
    answer.edit('go on');
    answer.delivery.picked.set('typed');

    await answer.send();

    expect(answer.delivery.choosable()).toBe(false);
    expect(sent[0]!.delivery).toBe('hook');
  });

  it('sends a typed round on a typeable Session', async () => {
    const { deps, session, sent } = setup(round('q1'));
    const answer = heldAnswer(deps, session, roundKind);
    answer.delivery.picked.set('typed');

    await answer.send();

    expect(sent).toEqual([
      {
        kind: 'round',
        sessionId: 's1',
        questionId: 'q1',
        answers: [{ number: '1', key: 'a', text: null }],
        delivery: 'typed',
      },
    ]);
  });

  it('always sends an ask by hook', async () => {
    const { deps, session, sent } = setup(ask('q1'));
    const answer = heldAnswer(deps, session, askKind);
    answer.edit(picked);
    answer.delivery.picked.set('typed');

    await answer.send();

    expect(answer.delivery.choosable()).toBe(false);
    expect(sent).toEqual([
      {
        kind: 'ask',
        sessionId: 's1',
        questionId: 'q1',
        answers: [{ question: 'Which store?', selected: ['Postgres'], other: null }],
        delivery: 'hook',
      },
    ]);
  });

  it('sends a trimmed reply and clears its Draft', async () => {
    const { deps, session, sent } = setup(reply('q1'));
    const answer = heldAnswer(deps, session, replyKind);
    answer.edit('  go on  ');

    await answer.send();

    expect(sent).toEqual([
      { kind: 'reply', sessionId: 's1', questionId: 'q1', text: 'go on', delivery: 'hook' },
    ]);
    expect(deps.drafts.load('s1', 'q1')).toBeUndefined();
  });

  it('sets the gone note on gone and clears it on sent', async () => {
    const { deps, session, notes, respondWith } = setup(reply('q1'));
    const answer = heldAnswer(deps, session, replyKind);
    answer.edit('go on');
    respondWith(async () => ({ code: 'gone' }));

    await answer.send();
    expect(notes.gone().has('s1')).toBe(true);
    expect(deps.drafts.load('s1', 'q1')).toBeUndefined();

    answer.edit('again');
    respondWith(async () => ({ code: 'sent' }));
    await answer.send();
    expect(notes.gone().has('s1')).toBe(false);
  });

  it('words a failed send, keeps the Draft and stops sending', async () => {
    const { deps, session, respondWith } = setup(reply('q1'));
    const answer = heldAnswer(deps, session, replyKind);
    answer.edit('go on');
    respondWith(async () => {
      throw new ApiFailure(502, { error: 'raw', reason: { code: 'tab-closed' } });
    });

    await answer.send();

    expect(answer.error()).toBe("the session's terminal tab is closed");
    expect(answer.sending()).toBe(false);
    expect(deps.drafts.load('s1', 'q1')).toBe('go on');
  });

  it('is not ready while a send is on its way, nor on an empty reply', async () => {
    const { deps, session, sent, respondWith } = setup(reply('q1'));
    const answer = heldAnswer(deps, session, replyKind);
    expect(answer.ready()).toBe(false);
    answer.edit('go on');
    let finish!: () => void;
    respondWith(() => new Promise((resolve) => (finish = () => resolve({ code: 'sent' }))));

    const sending = answer.send();
    expect(answer.sending()).toBe(true);
    expect(answer.ready()).toBe(false);
    await answer.send();
    finish();
    await sending;

    expect(sent).toHaveLength(1);
    expect(answer.ready()).toBe(true);
  });

  it('is not ready on a question of another kind', () => {
    const { deps, session } = setup(ask('q1'));
    const answer = heldAnswer(deps, session, replyKind);
    answer.edit('go on');

    expect(answer.ready()).toBe(false);
  });
});
