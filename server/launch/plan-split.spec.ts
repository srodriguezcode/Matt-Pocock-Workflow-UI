import { describe, expect, it } from 'vitest';
import type { LaunchPlan, StarTarget, StartOption } from '@contract/launch';
import type { Sky } from '@contract/sky';
import { commandLine } from '#server/core/runner.ts';
import { BOARD_PROMPT } from '#server/session/constants.ts';
import { boardStarts } from '#server/sky/starts.ts';
import { TEST_LINK } from '#server/testing/fake-link.ts';
import { githubSkillArg } from '#server/tracker/github/adapter.ts';
import { scratchSkillArg } from '#server/tracker/scratch/adapter.ts';
import { repo, sky, startable, system } from './fixtures.ts';
import { planStart } from './plan.ts';

const SUB_ISSUES =
  'Every ticket you publish for Spec #700 is its child. Add each one as a sub-issue of #700: ' +
  '`gh api --method POST repos/me/app/issues/700/sub_issues -F sub_issue_id=<db id>`, ' +
  'where the db id is `gh api repos/me/app/issues/<n> --jq .id`. ' +
  'Adding a sub-issue does not modify the parent issue. ' +
  'The board shows a ticket that is not a sub-issue as a Loose ticket.';
const SETTINGS = `--settings ${TEST_LINK.settingsPath} --append-system-prompt ${commandLine('', [`${BOARD_PROMPT} ${SUB_ISSUES}`]).trimStart()}`;
const target = { kind: 'split', id: '700' } as const;
const spec = (over: Partial<Parameters<typeof system>[1]> = {}) =>
  system('700', { state: 'needs-tickets', splitFrontier: true, ...over });

function plan(s: Sky): LaunchPlan {
  const result = planStart({
    sky: s,
    target,
    option: startable(target),
    repo: repo(),
    link: TEST_LINK,
    base: null,
    origin: { branches: ['main'], defaultBranch: 'main' },
    local: { branches: [], worktrees: [] },
    commands: {
      reread: (id) => `reread ${id}`,
      claim: (id) => `claim ${id}`,
      skillArg: s.tracker === 'scratch' ? scratchSkillArg : githubSkillArg,
      branchSlug: (ref) => String(ref.number),
    },
  });
  if (!result.ok) throw new Error(result.reason.code);
  return result.plan;
}

describe('planStart on a Split frontier', () => {
  it('runs /to-tickets in the main checkout with no claim, base or worktree', () => {
    const p = plan(sky({ systems: [spec()] }));
    expect(p).toMatchObject({
      skill: '/to-tickets #700',
      base: null,
      branch: null,
      worktree: null,
      cwd: '/code/app',
      claims: [],
      command: `cd /code/app && UAW_TARGET='repo=%2Fcode%2Fapp&kind=split&id=700' claude ${SETTINGS} "/to-tickets #700"`,
    });
    expect(p.steps.map((step) => step.key)).toEqual(['terminal']);
  });

  it('hands /to-tickets the spec.md path on a .scratch Spec, with its issues folder in the prompt', () => {
    const folder = '/code/app/.scratch/effort';
    const s = sky({ tracker: 'scratch', systems: [spec({ id: '700', path: folder })] });
    const p = plan(s);
    expect(p.skill).toBe(`/to-tickets ${folder}/spec.md`);
    const prompt =
      `Every ticket you publish for this Spec is its child: write each one under ${folder}/issues/. ` +
      'The board shows a ticket outside that folder as a Loose ticket.';
    expect(p.command).toContain(commandLine('', [`${BOARD_PROMPT} ${prompt}`]).trimStart());
    expect(p.command).not.toContain('sub_issues');
  });

  it('gives an unlinked Split Session the sub-issue line alone', () => {
    const p = planStart({
      sky: sky({ systems: [spec()] }),
      target,
      option: startable(target),
      repo: repo(),
      base: null,
      origin: { branches: ['main'], defaultBranch: 'main' },
      local: { branches: [], worktrees: [] },
      commands: {
        reread: (id) => `reread ${id}`,
        claim: (id) => `claim ${id}`,
        skillArg: githubSkillArg,
        branchSlug: (ref) => String(ref.number),
      },
    });
    expect(p.ok && p.plan.command).toBe(
      `cd /code/app && claude --append-system-prompt ${commandLine('', [SUB_ISSUES]).trimStart()} "/to-tickets #700"`,
    );
  });
});

describe('boardStarts on a Split frontier', () => {
  const starts: Record<string, StartOption> = { '700': startable(target) };
  const scope = (live: { repo: string; target: StarTarget }[]) => ({ live, repo: '/code/app' });

  it('offers the Start', () => {
    expect(boardStarts(starts, scope([]))['700']).toMatchObject({ enabled: true });
  });

  it('disables it with splitting while a Session on that Spec is live', () => {
    const live = [{ repo: '/code/app', target }];
    expect(boardStarts(starts, scope(live))['700']).toMatchObject({
      enabled: false,
      reason: { code: 'splitting' },
    });
  });

  it('ignores a live Session on another Spec or repo', () => {
    const live = [
      { repo: '/code/app', target: { kind: 'split', id: '701' } as const },
      { repo: '/code/other', target },
    ];
    expect(boardStarts(starts, scope(live))['700']).toMatchObject({ enabled: true });
  });
});
