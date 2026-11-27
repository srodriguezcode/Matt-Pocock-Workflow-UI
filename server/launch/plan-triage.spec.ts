import { describe, expect, it } from 'vitest';
import type { LaunchPlan } from '@contract/launch';
import type { Sky } from '@contract/sky';
import { commandLine } from '#server/core/runner.ts';
import { BOARD_PROMPT } from '#server/session/constants.ts';
import { TEST_LINK } from '#server/testing/fake-link.ts';
import { githubSkillArg } from '#server/tracker/github/adapter.ts';
import { scratchSkillArg } from '#server/tracker/scratch/adapter.ts';
import { repo, sky, startable, ticket } from './fixtures.ts';
import { planStart } from './plan.ts';

const SETTINGS = `--settings ${TEST_LINK.settingsPath} --append-system-prompt ${commandLine('', [BOARD_PROMPT]).trimStart()}`;
const untriaged = (over: Parameters<typeof ticket>[1] = {}) =>
  ticket('25', { tags: ['needs-triage'], readiness: 'undecided', light: 'undecided', ...over });

function plan(s: Sky, id = '25', runtime: 'mac' | 'container' = 'mac'): LaunchPlan {
  const target = { kind: 'triage', id } as const;
  const result = planStart({
    sky: s,
    target,
    option: startable(target),
    repo: repo(),
    link: TEST_LINK,
    base: null,
    origin: { branches: ['main'], defaultBranch: 'main' },
    local: { branches: [], worktrees: [] },
    runtime,
    commands: {
      reread: (ref) => `reread ${ref}`,
      claim: (ref) => `claim ${ref}`,
      skillArg: s.tracker === 'scratch' ? scratchSkillArg : githubSkillArg,
      branchSlug: (ref) => String(ref.number),
    },
  });
  if (!result.ok) throw new Error(result.reason.code);
  return result.plan;
}

describe('planStart on an Untriaged ticket', () => {
  it('runs /triage in the main checkout with no claim, base or worktree', () => {
    const p = plan(sky({ tickets: [untriaged()] }));
    expect(p).toMatchObject({
      skill: '/triage #25',
      base: null,
      branch: null,
      worktree: null,
      cwd: '/code/app',
      claims: [],
      command: `cd /code/app && UAW_TARGET='repo=%2Fcode%2Fapp&kind=triage&id=25' claude ${SETTINGS} "/triage #25"`,
    });
    expect(p.steps.map((step) => step.key)).toEqual(['terminal']);
  });

  it('hands /triage the ticket file in .scratch', () => {
    const path = '/code/app/.scratch/effort/issues/03-x.md';
    const s = sky({ tracker: 'scratch', tickets: [untriaged({ id: 'effort/03', path })] });
    expect(plan(s, 'effort/03').skill).toBe(`/triage ${path}`);
  });

  it('opens a tmux window in the container', () => {
    const p = plan(sky({ tickets: [untriaged()] }), '25', 'container');
    expect(p.steps.map((step) => step.action.code)).toEqual(['open-tmux']);
    expect(p.claims).toEqual([]);
  });
});
