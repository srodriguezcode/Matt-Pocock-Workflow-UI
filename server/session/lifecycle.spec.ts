import { describe, expect, it } from 'vitest';
import type { AgentEntry } from './agents.ts';
import type { HookEvent } from './hook-event.ts';
import { afterHook, afterPoll, fromAgent, isWakePrompt, type StateCell } from './lifecycle.ts';

const T0 = new Date('2026-09-30T10:00:00Z');
const T1 = new Date('2026-09-30T10:05:00Z');
const base = { session_id: 's1', cwd: '/code/app.worktrees/feature/42' };

const working: StateCell = { state: 'working', waiting: null, since: T0 };
const turnEnd: StateCell = { state: 'waiting', waiting: 'turn-end', since: T0 };
const permission: StateCell = { state: 'waiting', waiting: 'permission-prompt', since: T0 };
const asking: StateCell = { state: 'asking', waiting: null, since: T0 };
const ended: StateCell = { state: 'ended', waiting: null, since: T0 };
const lost: StateCell = { state: 'lost', waiting: null, since: T0 };

const prompt: HookEvent = { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'go' };
const tool = (name: 'PreToolUse' | 'PostToolUse' | 'PermissionRequest'): HookEvent => ({
  ...base,
  hook_event_name: name,
  tool_name: 'Bash',
  tool_input: { command: 'npm test' },
});
const notification = (type?: string): HookEvent => ({
  ...base,
  hook_event_name: 'Notification',
  ...(type && { notification_type: type }),
});
const stop: HookEvent = { ...base, hook_event_name: 'Stop', last_assistant_message: 'Done.' };
const end: HookEvent = { ...base, hook_event_name: 'SessionEnd', reason: 'exit' };
const start: HookEvent = { ...base, hook_event_name: 'SessionStart' };

const entry = (busy: boolean): AgentEntry => ({ sessionId: 's1', pid: 1, cwd: base.cwd, busy });

describe('afterHook', () => {
  it('moves to Working on a prompt or a tool call, since now', () => {
    for (const event of [prompt, tool('PreToolUse'), tool('PostToolUse')]) {
      expect(afterHook(turnEnd, event, T1)).toEqual({ state: 'working', waiting: null, since: T1 });
    }
    expect(afterHook(permission, tool('PostToolUse'), T1).state).toBe('working');
  });

  it('returns the same cell when the state does not change', () => {
    expect(afterHook(working, tool('PreToolUse'), T1)).toBe(working);
    expect(afterHook(turnEnd, stop, T1)).toBe(turnEnd);
  });

  it('moves to Waiting on a turn end at Stop', () => {
    expect(afterHook(working, stop, T1)).toEqual({
      state: 'waiting',
      waiting: 'turn-end',
      since: T1,
    });
  });

  it('moves to Waiting on a permission prompt, but not while Asking', () => {
    expect(afterHook(working, notification('permission_prompt'), T1)).toEqual({
      state: 'waiting',
      waiting: 'permission-prompt',
      since: T1,
    });
    expect(afterHook(asking, notification('permission_prompt'), T1)).toBe(asking);
  });

  it('leaves the state alone on other notifications, SessionStart and PermissionRequest', () => {
    expect(afterHook(working, notification('idle_prompt'), T1)).toBe(working);
    expect(afterHook(working, notification(), T1)).toBe(working);
    expect(afterHook(turnEnd, start, T1)).toBe(turnEnd);
    expect(afterHook(working, tool('PermissionRequest'), T1)).toBe(working);
  });

  it('keeps a held round Asking when a second Stop lands', () => {
    expect(afterHook(asking, stop, T1)).toBe(asking);
  });

  it('moves to Ended on SessionEnd from any live state', () => {
    for (const cell of [working, turnEnd, permission, asking]) {
      expect(afterHook(cell, end, T1)).toEqual({ state: 'ended', waiting: null, since: T1 });
    }
  });
});

describe('afterPoll', () => {
  it('is Lost when the process is gone', () => {
    for (const cell of [working, turnEnd, permission, asking]) {
      expect(afterPoll(cell, null, T1)).toEqual({ state: 'lost', waiting: null, since: T1 });
    }
  });

  it('never makes a listed Session Lost, however quiet it is', () => {
    expect(afterPoll(working, entry(false), new Date('2026-10-30T10:00:00Z'))).toBe(working);
    expect(afterPoll(working, entry(true), T1)).toBe(working);
  });

  it('leaves a turn-end Waiting alone while the process still reads busy', () => {
    expect(afterPoll(turnEnd, entry(true), T1)).toBe(turnEnd);
    expect(afterPoll(turnEnd, entry(false), T1)).toBe(turnEnd);
  });

  it('leaves Asking and a permission prompt alone while the process lives', () => {
    expect(afterPoll(asking, entry(true), T1)).toBe(asking);
    expect(afterPoll(permission, entry(true), T1)).toBe(permission);
  });

  it('never moves Ended or Lost', () => {
    expect(afterPoll(ended, null, T1)).toBe(ended);
    expect(afterPoll(lost, entry(true), T1)).toBe(lost);
  });
});

describe('fromAgent', () => {
  it('starts a busy Session Working and an idle one Waiting on a turn end', () => {
    expect(fromAgent(entry(true), T1)).toEqual({ state: 'working', waiting: null, since: T1 });
    expect(fromAgent(entry(false), T1)).toEqual({
      state: 'waiting',
      waiting: 'turn-end',
      since: T1,
    });
  });
});

describe('isWakePrompt', () => {
  it('knows the task notification a rewake submits from a typed prompt', () => {
    expect(isWakePrompt('<task-notification>\n<task-id>x</task-id>')).toBe(true);
    expect(isWakePrompt('\n  <task-notification>')).toBe(true);
    expect(isWakePrompt('1 a / 2 b')).toBe(false);
    expect(isWakePrompt('see <task-notification>')).toBe(false);
  });
});
