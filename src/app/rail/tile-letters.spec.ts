import { describe, expect, it } from 'vitest';
import { folderName, tileLetters } from './tile-letters.ts';

describe('tileLetters', () => {
  it('takes the first letter of the first two words', () => {
    expect(tileLetters('ui-agent-workflow')).toBe('UA');
  });

  it('takes the first two letters of a single word', () => {
    expect(tileLetters('harbor')).toBe('HA');
  });

  it('splits on underscores too', () => {
    expect(tileLetters('star_map')).toBe('SM');
  });

  it('uppercases the result', () => {
    expect(tileLetters('foo-bar')).toBe('FB');
  });
});

describe('folderName', () => {
  it('takes the last path segment', () => {
    expect(folderName('/Users/dev/code/ui-agent-workflow')).toBe('ui-agent-workflow');
  });

  it('drops a trailing slash', () => {
    expect(folderName('/Users/dev/code/ui-agent-workflow/')).toBe('ui-agent-workflow');
  });
});
