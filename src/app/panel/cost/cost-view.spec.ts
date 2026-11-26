import { describe, expect, it } from 'vitest';
import type { CostReading } from '@contract/cost';
import { englishMessages } from '@app/i18n/messages.en';
import { costView } from './cost-view';

const text = englishMessages.board.panel.cost;

const reading: CostReading = {
  id: '42',
  sessions: 2,
  tokens: { input: 25, output: 245, cacheCreation: 1600, cacheRead: 18600 },
  dollars: 0.019101,
  workingMs: 120_000,
  partial: [{ code: 'no-price', models: ['claude-opus-9'] }],
};

describe('the Cost in the panel', () => {
  it('shows the total without cache reads, the dollars and the Working time', () => {
    const view = costView(reading, text);
    expect(view.none).toBe(false);
    expect(view.tokens).toBe('1,870 tokens');
    expect(view.dollars).toBe('$0.02');
    expect(view.working).toBe('2 min');
  });

  it('breaks the tokens down by kind on hover, cache reads included', () => {
    expect(costView(reading, text).breakdown).toBe(
      'Input: 25\nOutput: 245\nCache creation: 1,600\nCache read: 18,600',
    );
  });

  it('words why the dollars are partial', () => {
    expect(costView(reading, text).shortfalls).toEqual(['no price for claude-opus-9']);
  });

  it('reads none with no Session counted', () => {
    const view = costView({ ...reading, sessions: 0, partial: [] }, text);
    expect(view.none).toBe(true);
    expect(view.shortfalls).toEqual([]);
  });
});
