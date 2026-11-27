import { describe, expect, it } from 'vitest';
import type { ApiErrorReason, ReleaseRefusal } from '@contract/api';
import type { GapProblem } from '@contract/gap';
import type { PlanRefusal, StartReason, StepAction } from '@contract/launch';
import { englishMessages } from './messages.en';
import type { LaunchEnding } from './translation-name-groups.model';
import { word } from './word';

const codes = englishMessages.board.codes;

describe('English wording of Start reasons', () => {
  it('words each reason as the pill shows it', () => {
    const cases: [StartReason, string][] = [
      [{ code: 'no-map' }, 'no Map'],
      [{ code: 'off-map' }, 'not on the Map'],
      [{ code: 'in-flight', holder: 'me', mine: true }, 'in flight: yours'],
      [{ code: 'in-flight', holder: 'ana', mine: false }, 'in flight: @ana'],
      [{ code: 'in-flight', holder: null, mine: false }, 'in flight'],
      [{ code: 'undecided', label: 'triage' }, 'undecided: triage'],
      [{ code: 'undecided', label: null }, 'undecided'],
      [
        { code: 'blocked-by', blockers: ['#633'], outside: ['design sign-off'] },
        'blocked by #633, design sign-off',
      ],
      [
        { code: 'gated', blockers: ['#602'], system: 'Scheduled sweeps' },
        'gated: #602 blocks Scheduled sweeps',
      ],
      [{ code: 'ready-for-human' }, "ready-for-human: yours, not an agent's"],
      [{ code: 'no-decision-frontier' }, 'no decision frontier'],
      [{ code: 'no-tickets' }, 'no tickets yet'],
      [{ code: 'spent' }, 'every ticket is closed'],
      [{ code: 'system-gated', blockers: ['#602'] }, 'gated by #602'],
      [{ code: 'child-system', handle: '#80' }, '#80 is a System'],
      [{ code: 'ticket-in-flight', handle: '#701' }, '#701 is in flight'],
      [{ code: 'ticket-decision', handle: '#701' }, '#701 is a decision ticket'],
      [{ code: 'ticket-undecided', handle: '#712' }, '#712 is undecided'],
      [{ code: 'ticket-ready-for-human', handle: '#712' }, '#712 is ready-for-human'],
      [{ code: 'ticket-no-readiness', handle: '#712' }, '#712 has no readiness label'],
      [
        { code: 'blocked-from-outside', handle: '#701', blockers: ['#633'] },
        '#701 is blocked from outside by #633',
      ],
      [{ code: 'not-frontier-system' }, 'not a Frontier system'],
      [{ code: 'gap', problem: { code: 'iterm-missing' } }, 'Gap: iTerm2 is not installed'],
    ];
    expect(cases.map(([reason]) => word(codes.startReasons, reason))).toEqual(
      cases.map(([, text]) => text),
    );
  });

  it('words what changed between the pill and the plan', () => {
    const cases: [PlanRefusal, string][] = [
      [{ code: 'gone' }, 'no longer on the sky'],
      [{ code: 'nothing-to-start' }, 'nothing to start here'],
      [{ code: 'base-missing', branch: 'gone' }, "origin/gone doesn't exist"],
      [{ code: 'ticket-in-flight', handle: '#704' }, '#704 is in flight'],
    ];
    expect(cases.map(([reason]) => word(codes.planRefusals, reason))).toEqual(
      cases.map(([, text]) => text),
    );
  });
});

describe('English wording of plan steps', () => {
  it('words one claim by handle and several by count', () => {
    const cases: [StepAction, string][] = [
      [{ code: 'reread', handles: ['#613'] }, 'Re-read #613, stop if anyone holds it'],
      [{ code: 'reread', handles: ['#1', '#2', '#3'] }, 'Re-read all 3, stop if anyone holds one'],
      [{ code: 'check-base', branch: 'main' }, 'Check origin/main exists'],
      [{ code: 'claim', handles: ['#613'] }, 'Claim #613'],
      [{ code: 'claim', handles: ['#1', '#2', '#3'] }, 'Claim all 3, all-or-nothing'],
      [{ code: 'fetch' }, 'Fetch origin'],
      [
        { code: 'worktree-resume', branch: 'feature/613' },
        'Resume in the existing feature/613 worktree',
      ],
      [
        { code: 'worktree-on-branch', branch: 'feature/613' },
        'Worktree on the existing feature/613 branch',
      ],
      [
        { code: 'worktree-new', branch: 'feature/613', base: 'main' },
        'Worktree feature/613 off origin/main',
      ],
      [
        { code: 'worktree-detach', base: 'main' },
        'Architecture worktree at origin/main, no branch',
      ],
      [{ code: 'worktree-reset', base: 'main' }, 'Reset the architecture worktree to origin/main'],
      [{ code: 'open-tab' }, 'Open an iTerm2 tab'],
    ];
    expect(cases.map(([action]) => word(codes.stepActions, action))).toEqual(
      cases.map(([, text]) => text),
    );
  });
});

describe('English wording of how a Start ended', () => {
  it('words each ending', () => {
    const cases: [LaunchEnding, string][] = [
      [{ code: 'opened', command: 'cd /w && claude' }, 'Tab opened: cd /w && claude'],
      [
        { code: 'taken', taken: { code: 'held', handle: '#613', holder: 'ana' } },
        'Taken: @ana holds #613. Nothing changed.',
      ],
      [
        { code: 'taken', taken: { code: 'closed', handle: '#613' } },
        '#613 is closed. Nothing changed.',
      ],
      [
        { code: 'taken', taken: { code: 'claimed', handle: 'export/01' } },
        'Taken: export/01 is claimed. Nothing changed.',
      ],
      [
        {
          code: 'step-failed',
          action: { code: 'check-base', branch: 'main' },
          rollback: 'nothing-changed',
        },
        'Check origin/main exists failed. Nothing changed.',
      ],
      [
        { code: 'step-failed', action: { code: 'open-tab' }, rollback: 'rollback-incomplete' },
        'Open an iTerm2 tab failed. Rollback incomplete.',
      ],
      [
        { code: 'step-failed', action: { code: 'fetch' }, rollback: 'rolled-back' },
        'Fetch origin failed. Rolled back.',
      ],
      [{ code: 'refused', reason: { code: 'gone' } }, 'no longer on the sky'],
      [
        { code: 'refused', reason: { code: 'gap', problem: { code: 'claude-missing' } } },
        'claude is not installed',
      ],
      [{ code: 'crashed', error: 'socket hang up' }, 'socket hang up'],
      [{ code: 'cut-short' }, 'The Start stopped before it finished.'],
    ];
    expect(cases.map(([ending]) => word(codes.launchEndings, ending))).toEqual(
      cases.map(([, text]) => text),
    );
  });
});

describe('English wording of Gaps', () => {
  it('words the title and the effect of each Gap', () => {
    const cases: [GapProblem, string, string][] = [
      [{ code: 'gh-missing' }, 'gh is not installed', 'No sky for any repo.'],
      [{ code: 'gh-unauthed' }, 'gh is not logged in', 'No sky for any repo.'],
      [{ code: 'git-missing' }, 'git is not installed', 'No sky for any repo.'],
      [{ code: 'claude-missing' }, 'claude is not installed', 'Start is disabled everywhere.'],
      [{ code: 'iterm-missing' }, 'iTerm2 is not installed', 'Start is disabled everywhere.'],
      [
        { code: 'tracker-missing', file: 'docs/agents/issue-tracker.md' },
        'docs/agents/issue-tracker.md is missing',
        'No sky for this repo.',
      ],
      [{ code: 'tracker-unsupported' }, 'tracker not supported', 'No sky for this repo.'],
      [
        { code: 'labels-missing' },
        'canonical labels missing',
        'Tickets that need them read thinner.',
      ],
      [
        { code: 'sub-issues-deps' },
        'sub-issues or dependencies unavailable',
        'Systems and Lanes read thinner.',
      ],
      [
        { code: 'skill-missing', skill: 'implement' },
        '/implement is not installed',
        'Start on a Frontier ticket or system has nothing to run.',
      ],
      [
        { code: 'skill-missing', skill: 'implement-ticket' },
        '/implement-ticket is not installed',
        'Start on a Frontier ticket has nothing to run.',
      ],
      [
        { code: 'skill-missing', skill: 'implement-parallel' },
        '/implement-parallel is not installed',
        'Start on a Frontier system has nothing to run.',
      ],
      [
        { code: 'skill-missing', skill: 'wayfinder' },
        '/wayfinder is not installed',
        'Start on a decision or the Map has nothing to run.',
      ],
      [
        { code: 'base-off-origin', handle: '#12' },
        'Base on #12 points off origin',
        'A Start on #12 or its tickets stops at the Base check unless you pick another Base.',
      ],
      [
        { code: 'tickets-unlinked', handle: '#700', count: 2 },
        'Tickets of #700 are not its sub-issues',
        'Its 2 tickets show as Loose tickets, and #700 stays a Split frontier.',
      ],
      [
        { code: 'tickets-unlinked', handle: '#700', count: 1 },
        'Tickets of #700 are not its sub-issues',
        'Its ticket shows as a Loose ticket, and #700 stays a Split frontier.',
      ],
    ];
    expect(
      cases.map(([problem]) => [word(codes.gapTitles, problem), word(codes.gapEffects, problem)]),
    ).toEqual(cases.map(([, title, effect]) => [title, effect]));
  });
});

describe('English wording of API refusals', () => {
  it('words each refusal with the path it names', () => {
    const cases: [ApiErrorReason, string][] = [
      [{ code: 'not-a-checkout', path: '/code/nope' }, '/code/nope is not a git checkout'],
      [{ code: 'no-origin', path: '/code/app' }, '/code/app has no origin remote'],
      [{ code: 'origin-not-github' }, 'origin is not on GitHub'],
      [{ code: 'already-added', path: '/code/app' }, '/code/app is already added'],
      [{ code: 'bad-tile' }, 'tile must be 1 or 2 letters or a data:image/ URL'],
      [{ code: 'unknown-repo', path: '/code/gone' }, 'no repo at /code/gone'],
      [
        { code: 'fixed-identity', path: '/code/app' },
        "/code/app: owner and name come from origin and can't change",
      ],
      [{ code: 'bad-branch-prefix', prefix: 'a/b' }, "a/b can't start a branch name"],
      [{ code: 'unknown-label', label: 'bug' }, 'bug is not a canonical label'],
      [
        { code: 'type-failed', stderr: 'no iTerm tab' },
        "couldn't type into the terminal: no iTerm tab",
      ],
    ];
    expect(cases.map(([reason]) => word(codes.apiErrors, reason))).toEqual(
      cases.map(([, text]) => text),
    );
  });
});

describe('English Start labels', () => {
  it('counts the tickets a Frontier system starts', () => {
    expect(
      [
        { code: 'ticket' } as const,
        { code: 'decision' } as const,
        { code: 'map' } as const,
        { code: 'system', count: 3 } as const,
      ].map((label) => word(codes.startLabels, label)),
    ).toEqual(['Start', 'Start decision', 'Start the map', 'Start all 3']);
  });
});

describe('English wording of server refusals', () => {
  it('words a Release refused on an unclaimed ticket', () => {
    expect(
      word(codes.releaseRefusals, { code: 'not-claimed', status: 'done' } as ReleaseRefusal),
    ).toBe('not claimed, its Status is done');
    expect(
      word(codes.releaseRefusals, { code: 'not-claimed', status: null } as ReleaseRefusal),
    ).toBe('not claimed, it has no Status line');
  });

  it('words a missing default branch on origin', () => {
    expect(word(codes.apiErrors, { code: 'no-origin-head' } as ApiErrorReason)).toBe(
      'origin has no default branch',
    );
  });

  it('words a failed Base check from its code, not the step', () => {
    const ending: LaunchEnding = {
      code: 'step-failed',
      action: { code: 'check-base', branch: 'develop' },
      rollback: 'nothing-changed',
      reason: { code: 'base-missing', branch: 'develop' },
    };
    expect(word(codes.launchEndings, ending)).toBe(
      "origin/develop doesn't exist. Nothing changed.",
    );
  });
});
