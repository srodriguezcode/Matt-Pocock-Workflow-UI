import { describe, expect, it } from 'vitest';
import type { LaunchEvent, LaunchPlan } from '@contract/launch';
import { englishMessages } from '@app/i18n/messages.en';
import {
  advance,
  attachCommand,
  begin,
  currentStep,
  endEarly,
  outcome as wordOutcome,
  phase,
  rollbackIcon,
  stepIcon,
  type Launch,
} from './progress';

const plan: LaunchPlan = {
  target: { kind: 'ticket', id: '613' },
  skill: '/implement-ticket #613',
  base: { branch: 'main', source: 'default', systemId: null },
  branch: 'feature/613',
  worktree: '/w/feature/613',
  reuse: { branch: false, worktree: false },
  cwd: '/w/feature/613',
  command: 'cd /w/feature/613 && claude "/implement-ticket #613"',
  tmux: null,
  claims: ['613'],
  steps: [
    { key: 'reread', action: { code: 'reread', handles: ['#613'] }, commands: [] },
    { key: 'base', action: { code: 'check-base', branch: 'main' }, commands: [] },
    { key: 'claim', action: { code: 'claim', handles: ['#613'] }, commands: [] },
    { key: 'fetch', action: { code: 'fetch' }, commands: [] },
    {
      key: 'worktree',
      action: { code: 'worktree-new', branch: 'feature/613', base: 'main' },
      commands: [],
    },
    { key: 'terminal', action: { code: 'open-tab' }, commands: [] },
  ],
};

const codes = englishMessages.board.codes;
const opened = { code: 'opened', command: plan.command } as const;
const sheet = englishMessages.board.sheet;
const outcome = (launch: Launch) => wordOutcome(launch, codes, sheet);

const run = (
  events: LaunchEvent[],
  from: Launch = begin('/r', plan.target, { code: 'ticket' }, plan),
) => events.reduce(advance, from);

describe('launch progress', () => {
  it('ticks steps and reports the running one', () => {
    const launch = run([
      { type: 'step', index: 0, key: 'reread', status: 'running' },
      { type: 'step', index: 0, key: 'reread', status: 'done' },
      { type: 'step', index: 1, key: 'base', status: 'done' },
      { type: 'step', index: 2, key: 'claim', status: 'done' },
      { type: 'step', index: 3, key: 'fetch', status: 'running' },
    ]);
    expect(launch.steps).toEqual(['done', 'done', 'done', 'running', 'waiting', 'waiting']);
    expect(phase(launch)).toBe('running');
    expect(currentStep(launch)).toEqual({ n: 4, total: 6, key: 'fetch' });
  });

  it('keeps stderr and rollbacks of a failed Start, and ends failed', () => {
    const launch = run([
      { type: 'step', index: 4, key: 'worktree', status: 'failed', stderr: 'fatal: denied' },
      { type: 'rollback', command: 'git branch -D feature/613', ok: true, stderr: null },
      {
        type: 'rollback',
        command: 'gh issue edit 613 --remove-assignee @me',
        ok: false,
        stderr: 'HTTP 502',
      },
      {
        type: 'end',
        ok: false,
        outcome: {
          code: 'step-failed',
          action: { code: 'worktree-new', branch: 'feature/613', base: 'main' },
          rollback: 'rollback-incomplete',
        },
      },
    ]);
    expect(launch.steps[4]).toBe('failed');
    expect(launch.stderr).toBe('fatal: denied');
    expect(launch.rollbacks.map(rollbackIcon)).toEqual(['↺', '✗']);
    expect(phase(launch)).toBe('failed');
    expect(outcome(launch)).toBe(
      'Worktree feature/613 off origin/main failed. Rollback incomplete.',
    );
  });

  it('shows a taken message once', () => {
    const taken = { code: 'held', handle: '#613', holder: 'ana-m' } as const;
    const launch = run([
      { type: 'taken', taken },
      { type: 'end', ok: false, outcome: { code: 'taken', taken } },
    ]);
    expect(launch.taken).toEqual(taken);
    expect(codes.takenReasons.held(taken)).toBe('Taken: @ana-m holds #613. Nothing changed.');
    expect(outcome(launch)).toBeNull();
  });

  it('says what exists after a successful Start', () => {
    const done = run([{ type: 'end', ok: true, outcome: opened }]);
    expect(phase(done)).toBe('done');
    expect(outcome(done)).toBe('Claimed. Tab open in iTerm2.');
    const map = begin('/r', { kind: 'map', id: '1' }, { code: 'map' }, { ...plan, claims: [] });
    expect(outcome(run([{ type: 'end', ok: true, outcome: opened }], map))).toBe(
      'Tab open in iTerm2.',
    );
  });

  it('gives the attach command of a finished container Start, with its tmux name', () => {
    const inContainer = { ...plan, tmux: 'agent-613' };
    const start = begin('/r', plan.target, { code: 'ticket' }, inContainer);
    const done = run([{ type: 'end', ok: true, outcome: opened }], start);
    expect(attachCommand(done, sheet)).toBe('docker exec -it uaw tmux attach -t agent-613');
    expect(attachCommand(start, sheet)).toBeNull();
  });

  it('gives no attach command for a Mac Start', () => {
    const done = run([{ type: 'end', ok: true, outcome: opened }]);
    expect(attachCommand(done, sheet)).toBeNull();
  });

  it('fails the running step when the stream breaks off', () => {
    const launch = endEarly(run([{ type: 'step', index: 3, key: 'fetch', status: 'running' }]), {
      code: 'crashed',
      error: 'network down',
    });
    expect(launch.steps[3]).toBe('failed');
    expect(phase(launch)).toBe('failed');
    expect(outcome(launch)).toBe('network down');
    const cut = endEarly(run([]), { code: 'cut-short' });
    expect(outcome(cut)).toBe('The Start stopped before it finished.');
  });

  it('maps step status to its icon', () => {
    expect((['waiting', 'running', 'done', 'failed'] as const).map(stepIcon)).toEqual([
      '○',
      '◐',
      '✓',
      '✗',
    ]);
  });
});
