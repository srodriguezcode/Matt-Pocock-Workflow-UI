import { describe, expect, it } from 'vitest';
import { attribute } from './attribute.ts';
import type { AttributionContext, Session } from './session.ts';

const github: AttributionContext = {
  tracker: 'github',
  checkout: '/repo',
  worktreeRoot: '/repo.worktrees',
  mapId: '47',
  systemIds: ['47', '101'],
};
const scratch: AttributionContext = {
  tracker: 'scratch',
  checkout: '/repo',
  worktreeRoot: '/repo.worktrees',
  mapId: 'route',
  systemIds: ['route', 'phase-2'],
};

function session(cwd: string, prompt: string | null): Session {
  return { id: 's', cwd, prompt, usage: [], workingMs: 0 };
}

function markup(name: string, args: string): string {
  return `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>\n<command-args>${args}</command-args>`;
}

describe('attribute by launch prompt', () => {
  it('counts a launch prompt naming a Decision ticket toward that ticket', () => {
    expect(attribute(session('/repo', '/wayfinder 47 101'), github)).toBe('101');
    expect(attribute(session('/repo', markup('wayfinder', '47 101')), github)).toBe('101');
    const map = '/repo/.scratch/route/map.md';
    const ticket = '/repo/.scratch/route/issues/03-pick-store.md';
    expect(attribute(session('/repo', `/wayfinder ${map} ${ticket}`), scratch)).toBe('route/03');
    expect(attribute(session('/repo', markup('wayfinder', `${map} ${ticket}`)), scratch)).toBe(
      'route/03',
    );
  });

  it('counts a Map Start toward the Map', () => {
    expect(attribute(session('/repo', '/wayfinder 47'), github)).toBe('47');
    expect(attribute(session('/repo', markup('wayfinder', '47')), github)).toBe('47');
    const map = '/repo/.scratch/route/map.md';
    expect(attribute(session('/repo', `/wayfinder ${map}`), scratch)).toBe('route');
    expect(attribute(session('/repo', `/wayfinder "${map}"`), scratch)).toBe('route');
  });

  it('counts a Frontier system Start toward the System and none of its tickets', () => {
    const cwd = '/repo.worktrees/feature/101';
    expect(attribute(session(cwd, '/implement-parallel #101'), github)).toBe('101');
    expect(attribute(session(cwd, markup('implement-parallel', '#101')), github)).toBe('101');
  });

  it('maps a scratch worktree to a System whose effort name ends in a number', () => {
    expect(attribute(session('/repo.worktrees/feature/phase-2', null), scratch)).toBe('phase-2');
    expect(attribute(session('/repo.worktrees/feature/phase-2-03', null), scratch)).toBe(
      'phase-2/03',
    );
    expect(attribute(session('/repo.worktrees/feature/route-03', null), scratch)).toBe('route/03');
    expect(attribute(session('/repo.worktrees/feature/route', null), scratch)).toBe('route');
  });

  it('counts a hand-started session nowhere', () => {
    expect(attribute(session('/repo', '/implement #5'), github)).toBeNull();
    expect(attribute(session('/repo', 'fix the login bug'), github)).toBeNull();
    expect(attribute(session('/repo', null), github)).toBeNull();
    expect(attribute(session('/elsewhere', '/wayfinder 47 101'), github)).toBeNull();
    expect(attribute(session('/repo', '/wayfinder /repo/other/map.md'), scratch)).toBeNull();
  });
});
