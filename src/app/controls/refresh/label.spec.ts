import { describe, expect, it } from 'vitest';
import { englishMessages } from '@app/i18n/messages.en';
import { readLabel } from './label';

const refresh = englishMessages.board.refresh;

describe('readLabel', () => {
  it('shows the local time of the last good read', () => {
    expect(readLabel(refresh, '2026-09-25T14:02:59', false)).toBe('read 14:02');
    expect(readLabel(refresh, '2026-09-25T09:05:00', false)).toBe('read 09:05');
  });

  it('says "last read" once a later read failed', () => {
    expect(readLabel(refresh, '2026-09-25T14:02:00', true)).toBe('last read 14:02');
  });

  it('covers a repo never read', () => {
    expect(readLabel(refresh, null, false)).toBe('not read yet');
    expect(readLabel(refresh, null, true)).toBe('read failed');
  });
});
