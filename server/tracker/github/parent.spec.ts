import { describe, expect, it } from 'vitest';
import { parentSection } from './parent.ts';

describe('parentSection', () => {
  it('reads #N on the heading line or below it', () => {
    expect(parentSection('## Parent #700\n\n## What to build', 'me/app')).toBe('700');
    expect(parentSection('Intro\n\n## Parent\n\n#700\n\n## Blocked by\n\n#12', 'me/app')).toBe(
      '700',
    );
  });

  it("reads this repo's issue URL", () => {
    const body = '## Parent\n\nhttps://github.com/Me/App/issues/700\n';
    expect(parentSection(body, 'me/app')).toBe('700');
  });

  it('ignores another repo, another section and a body without one', () => {
    expect(parentSection('## Parent\n\nhttps://github.com/you/lib/issues/9', 'me/app')).toBeNull();
    expect(parentSection('## Blocked by\n\n#12', 'me/app')).toBeNull();
    expect(parentSection('## Parents of the idea\n\n#3', 'me/app')).toBeNull();
    expect(parentSection('', 'me/app')).toBeNull();
  });
});
