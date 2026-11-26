import { describe, expect, it } from 'vitest';
import { baseLine } from './base.ts';

describe('baseLine', () => {
  it('reads plain and backticked Base lines', () => {
    expect(baseLine('Intro\nBase: develop\n')).toBe('develop');
    expect(baseLine('Base: `feat/multi-media`')).toBe('feat/multi-media');
  });

  it('ignores bodies without one', () => {
    expect(baseLine('**Branch:** from `feat/x`')).toBeNull();
  });
});
