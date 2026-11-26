import { describe, expect, it } from 'vitest';
import type { SessionQuestion } from '@contract/session';
import { draftKey, dropDraft, parseDrafts, pruneDrafts, putDraft, type Holding } from './drafts';

const reply = (id: string): SessionQuestion => ({ kind: 'reply', id, message: '' });

const holding = (sessionId: string, question: SessionQuestion | null): Holding => ({
  sessionId,
  question,
});

describe('Draft store', () => {
  it('saves a Draft under its Session and question, and loads it back', () => {
    const drafts = putDraft({}, draftKey('s1', 'q1'), 'half an answer');

    expect(drafts[draftKey('s1', 'q1')]).toBe('half an answer');
    expect(drafts[draftKey('s1', 'q2')]).toBeUndefined();
    expect(parseDrafts(JSON.stringify(drafts))).toEqual(drafts);
  });

  it('replaces the Draft for the same question', () => {
    const drafts = putDraft(putDraft({}, 'a', 'first'), 'a', 'second');

    expect(drafts).toEqual({ a: 'second' });
  });

  it('clears one Draft and keeps the others', () => {
    const drafts = dropDraft(putDraft(putDraft({}, 'a', 1), 'b', 2), 'a');

    expect(drafts).toEqual({ b: 2 });
  });

  it('keeps only the most recently saved Drafts past the cap', () => {
    let drafts = {};
    for (const key of ['a', 'b', 'c']) drafts = putDraft(drafts, key, key, 2);
    drafts = putDraft(drafts, 'b', 'again', 2);
    drafts = putDraft(drafts, 'd', 'd', 2);

    expect(drafts).toEqual({ b: 'again', d: 'd' });
  });

  it('drops a Draft once its Session no longer holds that question', () => {
    let drafts = {};
    for (const key of [draftKey('s1', 'q1'), draftKey('s1', 'old'), draftKey('s2', 'q2')]) {
      drafts = putDraft(drafts, key, 'x');
    }
    drafts = putDraft(drafts, draftKey('gone', 'q3'), 'x');

    const pruned = pruneDrafts(drafts, [holding('s1', reply('q1')), holding('s2', null)]);

    expect(pruned).toEqual({ [draftKey('s1', 'q1')]: 'x' });
  });

  it('returns the same store when nothing was pruned', () => {
    const drafts = putDraft({}, draftKey('s1', 'q1'), 'x');

    expect(pruneDrafts(drafts, [holding('s1', reply('q1'))])).toBe(drafts);
  });

  it('reads bad or missing data as no Drafts', () => {
    expect(parseDrafts(null)).toEqual({});
    expect(parseDrafts('not json')).toEqual({});
    expect(parseDrafts('[1, 2]')).toEqual({});
    expect(parseDrafts('"text"')).toEqual({});
    expect(parseDrafts('null')).toEqual({});
  });
});
