interface HookBase {
  session_id: string;
  cwd: string;
  transcript_path?: string;
}

export type HookEvent =
  | (HookBase & { hook_event_name: 'SessionStart'; source?: string })
  | (HookBase & { hook_event_name: 'SessionEnd'; reason?: string })
  | (HookBase & { hook_event_name: 'UserPromptSubmit'; prompt: string })
  | (HookBase & {
      hook_event_name: 'PreToolUse' | 'PostToolUse' | 'PermissionRequest';
      tool_name: string;
      tool_input: unknown;
      tool_use_id?: string;
    })
  | (HookBase & { hook_event_name: 'Notification'; message?: string; notification_type?: string })
  | (HookBase & { hook_event_name: 'Stop'; last_assistant_message?: string });

export type HookName = HookEvent['hook_event_name'];

export type StopEvent = Extract<HookEvent, { hook_event_name: 'Stop' }>;

const NAMES: HookName[] = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'Notification',
  'Stop',
];

/** The hook input, or `null` when the body is not one. Unknown fields ride along untouched. */
export function readHookEvent(body: unknown): HookEvent | null {
  const raw = body as Partial<Record<'session_id' | 'cwd', unknown>> | null;
  if (!raw || typeof raw.session_id !== 'string' || typeof raw.cwd !== 'string') return null;
  const event = { ...raw } as Partial<Record<'hook_event_name' | 'prompt' | 'tool_name', unknown>>;
  switch (event.hook_event_name) {
    case 'UserPromptSubmit':
      if (typeof event.prompt !== 'string') return null;
      break;
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PermissionRequest':
      if (typeof event.tool_name !== 'string') return null;
      break;
    case 'Stop':
      dropUnlessString(event, 'last_assistant_message');
      break;
    case 'Notification':
      dropUnlessString(event, 'message');
      dropUnlessString(event, 'notification_type');
      break;
  }
  return NAMES.includes(event.hook_event_name as HookName) ? (event as unknown as HookEvent) : null;
}

function dropUnlessString(event: Record<string, unknown>, key: string): void {
  if (typeof event[key] !== 'string') delete event[key];
}
