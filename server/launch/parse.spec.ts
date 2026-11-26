import { describe, expect, it } from 'vitest';
import { HttpError } from '#server/http/types.ts';
import { MAX_PROMPT, parsePlanRequest } from './parse.ts';

const session = (target: Record<string, unknown>) =>
  parsePlanRequest({ repo: '/code/app', target: { kind: 'session', ...target } });

describe('parsePlanRequest', () => {
  it('keeps a star target and its Base override', () => {
    expect(
      parsePlanRequest({ repo: '/r', target: { kind: 'ticket', id: '613' }, base: 'dev' }),
    ).toEqual({ target: { kind: 'ticket', id: '613' }, base: 'dev' });
  });

  it('accepts a new session with only a key', () => {
    expect(session({ key: 'k1' })).toEqual({ target: { kind: 'session', key: 'k1' }, base: null });
  });

  it('keeps the first message and a new-session skill, and drops anything else', () => {
    expect(session({ key: 'k1', prompt: 'hi', skill: 'triage', id: 'x' })).toEqual({
      target: { kind: 'session', key: 'k1', prompt: 'hi', skill: 'triage' },
      base: null,
    });
  });

  it.each<[string, Record<string, unknown>]>([
    ['no key', {}],
    ['an empty key', { key: '' }],
    ['a key that is too long', { key: 'k'.repeat(41) }],
    ['a prompt that is not text', { key: 'k1', prompt: 42 }],
    ['a prompt that is too long', { key: 'k1', prompt: 'x'.repeat(MAX_PROMPT + 1) }],
    ['a skill that is not a new-session skill', { key: 'k1', skill: 'implement' }],
  ])('refuses a new session with %s', (_, target) => {
    expect(() => session(target)).toThrow(HttpError);
  });

  it('refuses a star target with no id', () => {
    expect(() => parsePlanRequest({ repo: '/r', target: { kind: 'ticket' } })).toThrow(HttpError);
  });
});
