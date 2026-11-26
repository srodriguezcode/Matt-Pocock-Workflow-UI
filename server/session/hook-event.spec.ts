import { describe, expect, it } from 'vitest';
import { readHookEvent } from './hook-event.ts';

const base = { session_id: 's1', cwd: '/r' };

describe('readHookEvent', () => {
  it('reads a well-formed event and keeps unknown fields', () => {
    const body = {
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: {},
      x: 1,
    };
    expect(readHookEvent(body)).toEqual(body);
  });

  it('rejects an event missing the field its name needs', () => {
    const bad = [
      { ...base, hook_event_name: 'UserPromptSubmit' },
      { ...base, hook_event_name: 'UserPromptSubmit', prompt: 3 },
      { ...base, hook_event_name: 'PreToolUse', tool_input: {} },
      { ...base, hook_event_name: 'PostToolUse', tool_name: null },
      { ...base, hook_event_name: 'PermissionRequest', tool_name: 1 },
      { ...base, hook_event_name: 'Unknown' },
      { session_id: 's1', hook_event_name: 'Stop' },
      null,
    ];
    for (const body of bad) expect(readHookEvent(body)).toBeNull();
  });

  it('drops optional fields that are not strings', () => {
    expect(readHookEvent({ ...base, hook_event_name: 'Stop', last_assistant_message: 4 })).toEqual({
      ...base,
      hook_event_name: 'Stop',
    });
    expect(
      readHookEvent({
        ...base,
        hook_event_name: 'Notification',
        message: 'm',
        notification_type: {},
      }),
    ).toEqual({ ...base, hook_event_name: 'Notification', message: 'm' });
  });
});
