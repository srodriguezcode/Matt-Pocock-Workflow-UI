import { describe, expect, it } from 'vitest';
import type { Gap } from '@contract/gap';
import { englishMessages } from '@app/i18n/messages.en';
import { allGaps, fixCommand, fixSkill, sortGaps, tierWord } from './gap-view';

const gapTiers = englishMessages.board.codes.gapTiers;

function gap(id: string, tier: Gap['tier'], fix: Gap['fix'] = null): Gap {
  const problem = { code: 'gh-missing' } as const;
  return { id, scope: 'repo', tier, problem, fix, blocks: [], searched: [], ids: [] };
}

describe('tierWord', () => {
  it('maps every tier to its sentence', () => {
    expect(tierWord(gapTiers, 'fatal')).toBe('No sky');
    expect(tierWord(gapTiers, 'start')).toBe('Blocks Start');
    expect(tierWord(gapTiers, 'thin')).toBe('Thins the sky');
  });
});

describe('sortGaps', () => {
  it('orders fatal, then start, then thin', () => {
    const input = [gap('c', 'thin'), gap('a', 'fatal'), gap('b', 'start')];
    expect(sortGaps(input).map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps gaps of the same tier in their original order', () => {
    const input = [gap('a', 'start'), gap('b', 'start')];
    expect(sortGaps(input).map((g) => g.id)).toEqual(['a', 'b']);
  });
});

describe('allGaps', () => {
  it('adds the read-failure Gap when the list does not already carry it', () => {
    const failure = gap('x', 'fatal');
    expect(allGaps([], failure).map((g) => g.id)).toEqual(['x']);
  });

  it('does not duplicate a Gap already in the list', () => {
    const shared = gap('x', 'fatal');
    expect(allGaps([shared], shared).map((g) => g.id)).toEqual(['x']);
  });

  it('sorts the merged list by tier', () => {
    const thin = gap('t', 'thin');
    const fatal = gap('f', 'fatal');
    expect(allGaps([thin], fatal).map((g) => g.id)).toEqual(['f', 't']);
  });

  it('passes through unchanged when there is no read failure', () => {
    const start = gap('s', 'start');
    expect(allGaps([start], null).map((g) => g.id)).toEqual(['s']);
  });
});

describe('fixCommand and fixSkill', () => {
  it('reads a command fix', () => {
    expect(fixCommand({ command: 'gh auth login' })).toBe('gh auth login');
    expect(fixSkill({ command: 'gh auth login' })).toBeNull();
  });

  it('reads a skill fix', () => {
    expect(fixSkill({ skill: '/wayfinder' })).toBe('/wayfinder');
    expect(fixCommand({ skill: '/wayfinder' })).toBeNull();
  });

  it('reads no fix as neither', () => {
    expect(fixCommand(null)).toBeNull();
    expect(fixSkill(null)).toBeNull();
  });
});
