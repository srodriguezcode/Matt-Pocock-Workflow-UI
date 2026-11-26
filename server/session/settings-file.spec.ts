import { describe, expect, it } from 'vitest';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { TEST_LINK } from '#server/testing/fake-link.ts';
import { HOLD_TIMEOUT_S, HOOK_TIMEOUT_S, TARGET_HEADER } from './constants.ts';
import { sessionSettings, writeSessionSettings } from './settings-file.ts';

const http = (timeout: number) => ({
  type: 'http',
  url: 'http://127.0.0.1:4200/api/session/hook',
  timeout,
  headers: { [TARGET_HEADER]: '$UAW_TARGET' },
  allowedEnvVars: ['UAW_TARGET'],
});

describe('sessionSettings', () => {
  it('holds only hooks, routed at the board', () => {
    const settings = sessionSettings('http://127.0.0.1:4200', '/board/rewake-hook.ts');
    expect(Object.keys(settings)).toEqual(['hooks']);
    expect(settings.hooks).toEqual({
      SessionStart: [{ hooks: [http(HOOK_TIMEOUT_S)] }],
      UserPromptSubmit: [{ hooks: [http(HOOK_TIMEOUT_S)] }],
      PreToolUse: [{ hooks: [http(HOOK_TIMEOUT_S)] }],
      PostToolUse: [{ hooks: [http(HOOK_TIMEOUT_S)] }],
      Notification: [{ hooks: [http(HOOK_TIMEOUT_S)] }],
      SessionEnd: [{ hooks: [http(HOOK_TIMEOUT_S)] }],
      PermissionRequest: [{ matcher: 'AskUserQuestion', hooks: [http(HOLD_TIMEOUT_S)] }],
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node /board/rewake-hook.ts http://127.0.0.1:4200',
              asyncRewake: true,
              timeout: HOLD_TIMEOUT_S,
            },
          ],
        },
      ],
    });
  });

  it('quotes a script path with spaces', () => {
    const { hooks } = sessionSettings('http://h', '/my board/rewake-hook.ts');
    expect(hooks['Stop']).toMatchObject([
      { hooks: [{ command: "node '/my board/rewake-hook.ts' http://h" }] },
    ]);
  });
});

describe('writeSessionSettings', () => {
  it('creates the folder and writes the hooks JSON at the link path', async () => {
    const fs = new FakeFs();
    await writeSessionSettings(fs, TEST_LINK);
    const written = JSON.parse(fs.files.get(TEST_LINK.settingsPath) ?? 'null');
    expect(Object.keys(written)).toEqual(['hooks']);
    expect(written.hooks.SessionStart).toEqual([{ hooks: [http(HOOK_TIMEOUT_S)] }]);
    expect(written.hooks.Stop[0].hooks[0].command).toMatch(
      /^node \S+\/server\/session\/rewake-hook\.ts http:\/\/127\.0\.0\.1:4200$/,
    );
  });
});
