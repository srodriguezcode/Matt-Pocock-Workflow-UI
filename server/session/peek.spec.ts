import { describe, expect, it } from 'vitest';
import type { HookEvent } from './hook-event.ts';
import { peekLine } from './peek.ts';

const NOW = new Date('2026-09-30T10:00:00Z');
const base = { session_id: 's1', cwd: '/w' };

function tool(
  name: string,
  input: unknown,
  hook: 'PreToolUse' | 'PostToolUse' = 'PreToolUse',
): HookEvent {
  return { ...base, hook_event_name: hook, tool_name: name, tool_input: input };
}

describe('peekLine', () => {
  it('shows a typed prompt as its first line, a Human prompt', () => {
    const line = peekLine(
      { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'fix it\nmore' },
      NOW,
    );
    expect(line).toEqual({
      at: NOW.toISOString(),
      kind: 'prompt',
      tool: null,
      text: 'fix it',
      full: 'fix it\nmore',
      human: true,
    });
  });

  it('marks no tool or turn-end line as human', () => {
    expect(peekLine(tool('Bash', { command: 'ls' }), NOW)?.human).toBe(false);
    const stop = { ...base, hook_event_name: 'Stop' as const, last_assistant_message: 'x' };
    expect(peekLine(stop, NOW)?.human).toBe(false);
  });

  it('shows nothing for the prompt a wake submits', () => {
    const wake = {
      ...base,
      hook_event_name: 'UserPromptSubmit' as const,
      prompt: '<task-notification>x',
    };
    expect(peekLine(wake, NOW)).toBeNull();
  });

  it('shows a tool with a short input', () => {
    const text = (name: string, input: unknown) => peekLine(tool(name, input), NOW)?.text;
    expect(text('Bash', { command: 'npm test', description: 'x' })).toBe('Bash: npm test');
    expect(text('Edit', { file_path: '/a/b.ts', old_string: 'secret' })).toBe('Edit: /a/b.ts');
    expect(text('Grep', { pattern: 'foo', path: '.' })).toBe('Grep: foo');
    expect(text('Agent', { description: 'Explore', prompt: 'long' })).toBe('Agent: Explore');
    expect(text('Skill', { skill: 'tdd' })).toBe('Skill: tdd');
    expect(text('WebFetch', { url: 'https://x' })).toBe('WebFetch');
    expect(peekLine(tool('Bash', { command: 'ls' }), NOW)?.tool).toBe('Bash');
  });

  it('keeps a multi-line command to its first line and cuts a long one', () => {
    expect(peekLine(tool('Bash', { command: 'a\nb' }), NOW)?.text).toBe('Bash: a');
    const long = peekLine(tool('Bash', { command: 'x'.repeat(300) }), NOW)?.text ?? '';
    expect(long).toHaveLength(120);
    expect(long.endsWith('…')).toBe(true);
  });

  it('shows a turn end as the first non-empty line of the last message', () => {
    const line = peekLine(
      { ...base, hook_event_name: 'Stop', last_assistant_message: '\n\nDone.\nMore' },
      NOW,
    );
    expect(line).toMatchObject({ kind: 'turn-end', tool: null, text: 'Done.' });
  });

  it('shows nothing for the other events', () => {
    expect(peekLine(tool('Bash', { command: 'ls' }, 'PostToolUse'), NOW)).toBeNull();
    expect(peekLine({ ...base, hook_event_name: 'SessionStart' }, NOW)).toBeNull();
    expect(peekLine({ ...base, hook_event_name: 'Notification' }, NOW)).toBeNull();
  });
});
