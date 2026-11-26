import { describe, expect, it } from 'vitest';
import { noticeKey, unseen } from './notice-key';

describe('unseen', () => {
  it('drops what was opened in Peek, until the Session moves again', () => {
    const asking = { sessionId: 'a', since: 't1' };
    const other = { sessionId: 'b', since: 't1' };
    const seen = new Set([noticeKey(asking)]);
    expect(unseen([asking, other], seen)).toEqual([other]);
    expect(unseen([{ sessionId: 'a', since: 't2' }], seen)).toEqual([
      { sessionId: 'a', since: 't2' },
    ]);
  });
});
