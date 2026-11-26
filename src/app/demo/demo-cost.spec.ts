import { describe, expect, it } from 'vitest';
import { englishMessages } from '@app/i18n/messages.en';
import { costView } from '@app/panel/cost/cost-view';
import { demoCost } from './demo-cost';
import { API_LIMITS_ID, LATE_LOAN_ID, LEND_BOOKS_MAP_ID, PORTFOLIO_PATH, SHELF_PATH } from './mock';

const text = englishMessages.board.panel.cost;

describe('demoCost', () => {
  it('reads 412k tokens, $1.84 and 14 min on "Rules for a late loan"', () => {
    const view = costView(demoCost(SHELF_PATH, LATE_LOAN_ID), text);
    expect(view).toMatchObject({ none: false, tokens: '412,000 tokens', dollars: '$1.84' });
    expect(view.working).toBe('14 min');
  });

  it('reads a smaller Cost on "Open Library API limits"', () => {
    const reading = demoCost(SHELF_PATH, API_LIMITS_ID);
    expect(reading.sessions).toBe(1);
    expect(costView(reading, text).tokens).toBe('102,000 tokens');
  });

  it('adds both tickets up on the Map', () => {
    const map = demoCost(SHELF_PATH, LEND_BOOKS_MAP_ID);
    const late = demoCost(SHELF_PATH, LATE_LOAN_ID);
    const limits = demoCost(SHELF_PATH, API_LIMITS_ID);
    expect(map).toMatchObject({ id: LEND_BOOKS_MAP_ID, sessions: 3, partial: [] });
    expect(map.tokens.cacheRead).toBe(late.tokens.cacheRead + limits.tokens.cacheRead);
    expect(map.dollars).toBeCloseTo(2.3);
    expect(map.workingMs).toBe(19 * 60_000);
    expect(costView(map, text).tokens).toBe('514,000 tokens');
  });

  it('reads no data on any other star or repo', () => {
    for (const reading of [
      demoCost(SHELF_PATH, 'scan-barcode/02'),
      demoCost(PORTFOLIO_PATH, LATE_LOAN_ID),
    ]) {
      expect(reading.sessions).toBe(0);
      expect(costView(reading, text).none).toBe(true);
    }
  });
});
