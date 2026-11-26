import { describe, expect, it } from 'vitest';
import { chipColours } from './chip';

describe('chipColours', () => {
  it('picks dark text on light labels and light text on dark ones', () => {
    expect(chipColours('fbca04')).toEqual({ background: '#fbca04', color: '#1b1f24' });
    expect(chipColours('5319e7')).toEqual({ background: '#5319e7', color: '#ffffff' });
    expect(chipColours('')).toBeNull();
  });
});
