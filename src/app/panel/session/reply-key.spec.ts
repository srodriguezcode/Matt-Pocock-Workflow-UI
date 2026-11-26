import { describe, expect, it } from 'vitest';
import { replyKey } from './reply-key';

const press = (modifiers: Partial<KeyboardEvent> = {}) => ({
  key: 'Enter',
  altKey: false,
  shiftKey: false,
  isComposing: false,
  ...modifiers,
});

describe('replyKey', () => {
  it('sends on Enter', () => {
    expect(replyKey(press(), true)).toBe('send');
  });

  it('sends on Command or Control with Enter, as before', () => {
    expect(replyKey(press({ metaKey: true }), true)).toBe('send');
    expect(replyKey(press({ ctrlKey: true }), true)).toBe('send');
  });

  it('adds a new line on Option with Enter, which Chrome on a Mac leaves blank', () => {
    expect(replyKey(press({ altKey: true }), true)).toBe('newline');
    expect(replyKey(press({ altKey: true }), false)).toBe('newline');
  });

  it('leaves Shift with Enter to the textarea, which adds a new line', () => {
    expect(replyKey(press({ shiftKey: true }), true)).toBe('type');
  });

  it('leaves Enter to the input method while it composes a character', () => {
    expect(replyKey(press({ isComposing: true }), true)).toBe('type');
  });

  it('holds Enter on an empty reply: no send and no new line', () => {
    expect(replyKey(press(), false)).toBe('hold');
  });

  it('leaves other keys alone', () => {
    expect(replyKey(press({ key: 'a' }), true)).toBe('type');
  });
});
