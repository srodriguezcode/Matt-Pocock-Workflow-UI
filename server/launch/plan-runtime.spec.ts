import { describe, expect, it } from 'vitest';
import type { LaunchTarget } from '@contract/launch';
import { githubSkillArg } from '#server/tracker/github/adapter.ts';
import { TEST_LINK } from '#server/testing/fake-link.ts';
import { repo, sky, startable, system, ticket } from './fixtures.ts';
import { planStart, type PlanInput } from './plan.ts';

const board = sky({
  mapId: '9',
  tickets: [ticket('613'), ticket('614'), ticket('615', { research: true })],
  systems: [system('9')],
});

function plan(target: LaunchTarget, runtime: 'mac' | 'container') {
  const input: PlanInput = {
    sky: board,
    option: startable(target),
    repo: repo(),
    target,
    link: TEST_LINK,
    base: null,
    origin: { branches: ['main'], defaultBranch: 'main' },
    local: { branches: [], worktrees: [] },
    runtime,
    commands: {
      reread: (id) => `reread ${id}`,
      claim: (id) => `claim ${id}`,
      skillArg: githubSkillArg,
      branchSlug: (ref) => String(ref.number),
    },
  };
  return planStart(input);
}

const targets: [string, LaunchTarget][] = [
  ['ticket', { kind: 'ticket', id: '613' }],
  ['HITL ticket', { kind: 'ticket', id: '614' }],
  ['system', { kind: 'system', id: '9' }],
  ['decision', { kind: 'decision', id: '615' }],
  ['split', { kind: 'split', id: '9' }],
  ['map', { kind: 'map', id: '9' }],
  ['architecture', { kind: 'architecture' }],
  ['new session', { kind: 'session', key: 'k1' }],
];

describe('planStart by runtime', () => {
  it('opens a tmux window in the container', () => {
    const result = plan({ kind: 'ticket', id: '613' }, 'container');
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.plan.tmux).toBe('uaw-app-3258da-ticket-613');
    expect(result.plan.steps.at(-1)!.action).toEqual({
      code: 'open-tmux',
      name: 'uaw-app-3258da-ticket-613',
    });
  });

  it.each(targets)('allows a %s Start in the container', (_, target) => {
    expect(plan(target, 'container').ok).toBe(true);
  });

  it('names a tmux window for the architecture review in the container', () => {
    const result = plan({ kind: 'architecture' }, 'container');
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.plan.tmux).toMatch(/^uaw-app-[0-9a-f]{6}-architecture$/);
  });

  it('names each new session apart, so a second one never kills the first', () => {
    const name = (key: string) => {
      const result = plan({ kind: 'session', key }, 'container');
      if (!result.ok) throw new Error(result.reason.code);
      return result.plan.tmux;
    };
    expect(name('k1')).toMatch(/^uaw-app-[0-9a-f]{6}-session-k1$/);
    expect(name('k2')).not.toBe(name('k1'));
  });

  it('keeps the Mac tab', () => {
    const result = plan({ kind: 'ticket', id: '613' }, 'mac');
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.plan.tmux).toBeNull();
  });

  it.each(['mac', 'container'] as const)(
    'has no --remote-control, where or choice on %s',
    (runtime) => {
      const result = plan({ kind: 'ticket', id: '613' }, runtime);
      if (!result.ok) throw new Error(result.reason.code);
      expect(result.plan.command).not.toContain('--remote-control');
      expect(result.plan).not.toHaveProperty('where');
      expect(result.plan).not.toHaveProperty('choice');
    },
  );
});
