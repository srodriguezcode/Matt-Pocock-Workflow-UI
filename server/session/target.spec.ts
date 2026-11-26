import { describe, expect, it } from 'vitest';
import { decodeTarget, encodeTarget, linkedTarget, type LinkTarget } from './target.ts';

describe('linkedTarget', () => {
  it('follows a new session by its key and its first line, and not the architecture review', () => {
    expect(
      linkedTarget({ kind: 'session', key: 'k1', skill: 'triage', prompt: ' a\n b ' }),
    ).toEqual({ kind: 'session', key: 'k1', title: '/triage a b' });
    expect(linkedTarget({ kind: 'session', key: 'k1' })).toEqual({
      kind: 'session',
      key: 'k1',
      title: '',
    });
    expect(linkedTarget({ kind: 'architecture' })).toBeNull();
  });

  it('cuts a long first line to 80 characters', () => {
    const linked = linkedTarget({ kind: 'session', key: 'k1', prompt: 'x'.repeat(200) });
    expect(linked?.kind === 'session' && linked.title).toBe(`${'x'.repeat(79)}…`);
  });
});

describe('encodeTarget', () => {
  it('round-trips a new session and a star', () => {
    const session: LinkTarget = {
      repo: '/code/app',
      target: { kind: 'session', key: 'k1', title: 'a&b=c' },
    };
    const star: LinkTarget = { repo: '/code/app', target: { kind: 'ticket', id: 'maps/01' } };
    expect(decodeTarget(encodeTarget(session))).toEqual(session);
    expect(decodeTarget(encodeTarget(star))).toEqual(star);
  });

  it('refuses a new session with no key', () => {
    expect(decodeTarget('repo=%2Fr&kind=session&title=x')).toBeNull();
  });
});
