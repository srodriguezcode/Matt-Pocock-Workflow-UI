import type { PeekLine } from '@contract/session';
import type { HookEvent } from './hook-event.ts';
import { isWakePrompt } from './lifecycle.ts';

const MAX_TEXT = 120;

export function peekLine(event: HookEvent, now: Date): PeekLine | null {
  const at = now.toISOString();
  switch (event.hook_event_name) {
    case 'UserPromptSubmit':
      if (isWakePrompt(event.prompt)) return null;
      return {
        at,
        kind: 'prompt',
        tool: null,
        text: oneLine(event.prompt),
        full: event.prompt,
        human: true,
      };
    case 'PreToolUse':
      return {
        at,
        kind: 'tool',
        tool: event.tool_name,
        text: toolText(event.tool_name, event.tool_input),
        full: null,
        human: false,
      };
    case 'Stop':
      return {
        at,
        kind: 'turn-end',
        tool: null,
        text: oneLine(event.last_assistant_message ?? ''),
        full: event.last_assistant_message ?? '',
        human: false,
      };
    default:
      return null;
  }
}

function toolText(name: string, input: unknown): string {
  const detail = toolDetail(name, (input ?? {}) as Record<string, unknown>);
  return oneLine(detail ? `${name}: ${detail}` : name);
}

function toolDetail(name: string, input: Record<string, unknown>): string | null {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = input[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return null;
  };
  switch (name) {
    case 'Bash':
      return pick('command');
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return pick('file_path', 'notebook_path');
    case 'Grep':
    case 'Glob':
      return pick('pattern');
    case 'Task':
    case 'Agent':
      return pick('description');
    case 'Skill':
      return pick('skill', 'name');
    default:
      return null;
  }
}

/** The prompt line for an answer sent from the board, which reaches the Session only as a wake. */
export function boardAnswerLine(text: string, now: Date): PeekLine {
  return {
    at: now.toISOString(),
    kind: 'prompt',
    tool: null,
    text: oneLine(text),
    full: text,
    human: false,
  };
}

function oneLine(text: string): string {
  const line =
    text
      .split('\n')
      .find((l) => l.trim() !== '')
      ?.trim() ?? '';
  return line.length > MAX_TEXT ? `${line.slice(0, MAX_TEXT - 1)}…` : line;
}
