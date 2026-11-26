import { describe, expect, it } from 'vitest';
import { identify, type Launch } from './identity.ts';
import { encodeTarget } from './target.ts';

const REPO = '/code/app';
const ticket42: Launch = {
  repo: REPO,
  target: { kind: 'ticket', id: '42' },
  cwd: '/code/app.worktrees/feature/42',
  terminal: null,
};
const map: Launch = { repo: REPO, target: { kind: 'map', id: '7' }, cwd: REPO, terminal: null };

describe('identify', () => {
  it('takes the target header over any cwd', () => {
    const header = encodeTarget({ repo: '/code/other', target: { kind: 'system', id: 'ci' } });
    expect(identify(header, ticket42.cwd, [ticket42])).toEqual({
      repo: '/code/other',
      target: { kind: 'system', id: 'ci' },
    });
  });

  it("falls back to a Start's worktree when the header is missing or unreadable", () => {
    const who = { repo: REPO, target: { kind: 'ticket', id: '42' } };
    expect(identify(undefined, ticket42.cwd, [ticket42])).toEqual(who);
    expect(identify('kind=nope', ticket42.cwd, [ticket42])).toEqual(who);
  });

  it('matches a cwd deeper inside the worktree, not a sibling that shares its prefix', () => {
    expect(identify(undefined, `${ticket42.cwd}/server`, [ticket42])?.target).toEqual({
      kind: 'ticket',
      id: '42',
    });
    expect(identify(undefined, `${ticket42.cwd}0`, [ticket42])).toBeNull();
  });

  it('prefers the newest Start on the same worktree', () => {
    const retry: Launch = { ...ticket42, target: { kind: 'system', id: '40' } };
    expect(identify(undefined, ticket42.cwd, [ticket42, retry])?.target).toEqual({
      kind: 'system',
      id: '40',
    });
  });

  it('never matches the main checkout by cwd, and ignores a hand-started session', () => {
    expect(identify(undefined, REPO, [map])).toBeNull();
    expect(identify(undefined, `${REPO}/src`, [map, ticket42])).toBeNull();
    expect(identify(undefined, '/somewhere/else', [ticket42])).toBeNull();
  });
});
