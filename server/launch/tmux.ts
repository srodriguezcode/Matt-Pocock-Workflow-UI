import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { commandLine, type CommandRunner } from '#server/core/runner.ts';
import type { LaunchTarget } from '@contract/launch';
import type { TypeFailure } from '#server/session/hub.ts';
import type { Cmd } from './commands.ts';

const ENTER_DELAY_MS = 200;
const TYPE_TIMEOUT_MS = 10_000;

/**
 * tmux forbids `.` and `:` in a name. A new session's `key` keeps a second one from killing the
 * first, since `tmuxOpen` kills any session under the same name.
 */
export function tmuxName(repo: string, target: LaunchTarget): string {
  const hash = createHash('sha256').update(repo).digest('hex').slice(0, 6);
  const id = 'id' in target ? `-${target.id}` : 'key' in target ? `-${target.key}` : '';
  return `uaw-${basename(repo)}-${hash}-${target.kind}${id}`.replace(/[^\w-]/g, '_');
}

/** The window stays a shell after `claude` exits. A session under the same name is killed first. */
export function tmuxOpen(
  name: string,
  command: string,
  shell = process.env['SHELL'] || '/bin/sh',
): Cmd {
  const kept = `${command}; exec ${commandLine(shell, ['-il'])}`;
  const script = [
    `${commandLine('tmux', ['kill-session', '-t', `=${name}`])} 2>/dev/null`,
    commandLine('tmux', ['new-session', '-d', '-s', name, kept]),
  ].join('; ');
  return { command: 'sh', args: ['-c', script] };
}

/** The paste is bracketed, and ESC is dropped so the text cannot end it early. */
export function typeCommands(name: string, text: string): { load: Cmd; paste: Cmd; enter: Cmd } {
  const buffer = `uaw-${name}`;
  const target = `=${name}:`;
  return {
    load: { command: 'tmux', args: ['load-buffer', '-b', buffer, '-'] },
    paste: { command: 'tmux', args: ['paste-buffer', '-p', '-d', '-b', buffer, '-t', target] },
    enter: { command: 'tmux', args: ['send-keys', '-t', target, 'Enter'] },
  };
}

/** A missing session is `tab-closed`. */
export async function typeIntoTmux(
  runner: CommandRunner,
  name: string,
  text: string,
): Promise<TypeFailure | null> {
  const { load, paste, enter } = typeCommands(name, text);
  const has = await runner.run('tmux', ['has-session', '-t', `=${name}`]);
  if (has.code !== 0) return { code: 'tab-closed' };
  const input = text.replaceAll('\x1b', '');
  const steps = [
    { cmd: load, input },
    { cmd: paste, input: undefined },
  ];
  for (const { cmd, input: stdin } of steps) {
    const result = await runner.run(cmd.command, cmd.args, {
      input: stdin,
      timeoutMs: TYPE_TIMEOUT_MS,
    });
    if (result.code !== 0) return { code: 'type-failed', stderr: result.stderr.trim() };
  }
  await new Promise((resolve) => setTimeout(resolve, ENTER_DELAY_MS));
  const sent = await runner.run(enter.command, enter.args, { timeoutMs: TYPE_TIMEOUT_MS });
  if (sent.code !== 0) return { code: 'type-failed', stderr: sent.stderr.trim() };
  return null;
}
