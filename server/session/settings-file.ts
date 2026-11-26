import { dirname, join } from 'node:path';
import { commandLine } from '#server/core/runner.ts';
import type { FileSystem } from '#server/core/fs.ts';
import type { LinkConfig } from '#server/http/types.ts';
import {
  HOLD_TIMEOUT_S,
  HOOK_PATH,
  HOOK_TIMEOUT_S,
  TARGET_ENV,
  TARGET_HEADER,
} from './constants.ts';

export function sessionSettingsPath(home: string): string {
  return join(home, '.config', 'ui-agent-workflow', 'session-settings.json');
}

const HTTP_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'SessionEnd',
];

export function sessionSettings(hookBase: string, rewakeScript: string) {
  const http = (timeout: number) => ({
    type: 'http',
    url: `${hookBase}${HOOK_PATH}`,
    timeout,
    headers: { [TARGET_HEADER]: `$${TARGET_ENV}` },
    allowedEnvVars: [TARGET_ENV],
  });
  const hooks: Record<string, unknown[]> = {};
  for (const event of HTTP_EVENTS) hooks[event] = [{ hooks: [http(HOOK_TIMEOUT_S)] }];
  hooks['PermissionRequest'] = [{ matcher: 'AskUserQuestion', hooks: [http(HOLD_TIMEOUT_S)] }];
  hooks['Stop'] = [
    {
      hooks: [
        {
          type: 'command',
          command: commandLine('node', [rewakeScript, hookBase]),
          asyncRewake: true,
          timeout: HOLD_TIMEOUT_S,
        },
      ],
    },
  ];
  return { hooks };
}

/** Writes the hooks-only settings file every linked Start passes with `--settings`. */
export async function writeSessionSettings(fs: FileSystem, link: LinkConfig): Promise<void> {
  const script = join(import.meta.dirname, 'rewake-hook.ts');
  await fs.mkdir(dirname(link.settingsPath));
  await fs.write(
    link.settingsPath,
    JSON.stringify(sessionSettings(link.hookBase, script), null, 2),
  );
}
