import type { SessionState, WaitingKind } from '@contract/session';
import type { AgentEntry } from './agents.ts';
import type { HookEvent } from './hook-event.ts';

export interface StateCell {
  state: SessionState;
  waiting: WaitingKind | null;
  since: Date;
}

/** The cell after one hook event. Returns `cell` itself when the event does not move it. */
export function afterHook(cell: StateCell, event: HookEvent, now: Date): StateCell {
  switch (event.hook_event_name) {
    case 'UserPromptSubmit':
    case 'PreToolUse':
    case 'PostToolUse':
      return moveTo(cell, 'working', null, now);
    case 'Notification':
      return event.notification_type === 'permission_prompt' && cell.state !== 'asking'
        ? moveTo(cell, 'waiting', 'permission-prompt', now)
        : cell;
    case 'Stop':
      return cell.state === 'asking' ? cell : moveTo(cell, 'waiting', 'turn-end', now);
    case 'SessionEnd':
      return moveTo(cell, 'ended', null, now);
    default:
      return cell;
  }
}

/**
 * The cell after one `agents --json` read. `entry` is `null` when the Session is not listed.
 * Returns `cell` itself when nothing moves.
 */
export function afterPoll(cell: StateCell, entry: AgentEntry | null, now: Date): StateCell {
  if (cell.state === 'ended' || cell.state === 'lost') return cell;
  if (!entry) return moveTo(cell, 'lost', null, now);
  return cell;
}

/** The cell a Session found only in `agents --json` starts in, after a board restart. */
export function fromAgent(entry: AgentEntry, now: Date): StateCell {
  return {
    state: entry.busy ? 'working' : 'waiting',
    waiting: entry.busy ? null : 'turn-end',
    since: now,
  };
}

/** True for the prompt an `asyncRewake` wake submits, which is no answer typed in the terminal. */
export function isWakePrompt(prompt: string): boolean {
  return /^\s*<task-notification>/.test(prompt);
}

function moveTo(
  cell: StateCell,
  state: SessionState,
  waiting: WaitingKind | null,
  now: Date,
): StateCell {
  return cell.state === state && cell.waiting === waiting ? cell : { state, waiting, since: now };
}
