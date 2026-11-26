import { commandLine } from '#server/core/runner.ts';
import { BOARD_PROMPT, TARGET_ENV } from '#server/session/constants.ts';

export interface Cmd {
  command: string;
  args: string[];
}

export const show = (cmd: Cmd): string => commandLine(cmd.command, cmd.args);

export const baseCheck = (base: string): Cmd => ({
  command: 'git',
  args: ['ls-remote', '--exit-code', '--heads', 'origin', base],
});

export const fetchOrigin: Cmd = { command: 'git', args: ['fetch', 'origin'] };

export function worktreeAdd(path: string, branch: string, base: string | null): Cmd {
  const from = base === null ? [branch] : ['-b', branch, `origin/${base}`];
  return { command: 'git', args: ['worktree', 'add', path, ...from] };
}

export const worktreeRemove = (path: string): Cmd => ({
  command: 'git',
  args: ['worktree', 'remove', '--force', path],
});

export const branchDelete = (branch: string): Cmd => ({
  command: 'git',
  args: ['branch', '-D', branch],
});

export const branchExists = (branch: string): Cmd => ({
  command: 'git',
  args: ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
});

/**
 * Starts the tab with the command instead of typing it: typed text races the shell's startup files
 * and loses characters. `-il` loads them first, and the tab stays a shell after `claude` exits.
 */
export function openTab(text: string, shell = process.env['SHELL'] || '/bin/zsh'): Cmd {
  const inner = `${text}; exec ${commandLine(shell, ['-il'])}`;
  const launch = appleScriptString(commandLine(shell, ['-ilc', inner]));
  const lines = [
    'tell application "iTerm2"',
    'if (count of windows) is 0 then',
    `set made to (create window with default profile command "${launch}")`,
    'else',
    `tell current window to set made to (create tab with default profile command "${launch}")`,
    'end if',
    'return id of current session of made',
    'end tell',
  ];
  return { command: 'osascript', args: lines.flatMap((line) => ['-e', line]) };
}

/** What `typePrompt` puts on stderr when no iTerm session has the id. */
export const TAB_CLOSED = 'uaw:tab-closed';

/**
 * Types `text` into the iTerm session `terminal` and submits it once. Bracketed paste keeps a
 * multi-line answer in one prompt. ESC is dropped, so the text cannot end the paste early.
 */
export function typePrompt(terminal: string, text: string): Cmd {
  const lines = [
    'on run argv',
    'set esc to character id 27',
    'tell application "iTerm2"',
    'repeat with w in windows',
    'repeat with t in tabs of w',
    'repeat with s in sessions of t',
    'if id of s is item 1 of argv then',
    'tell s to write text (esc & "[200~" & item 2 of argv & esc & "[201~") newline no',
    'delay 0.2',
    'tell s to write text ""',
    'return',
    'end if',
    'end repeat',
    'end repeat',
    'end repeat',
    'end tell',
    `error "${TAB_CLOSED}"`,
    'end run',
  ];
  const pasted = text.replaceAll('\x1b', '');
  return {
    command: 'osascript',
    args: [...lines.flatMap((line) => ['-e', line]), terminal, pasted],
  };
}

function appleScriptString(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export interface SessionLink {
  settingsPath: string;
  target: string;
}

/**
 * The tab's line, `cd <dir> && claude "<skill>"`, or plain `claude` when `skill` is empty. Linked,
 * it adds the target env var, `--settings` and `BOARD_PROMPT`. `prompt` follows that, linked or not.
 */
export function sessionCommand(
  cwd: string,
  skill: string,
  link: SessionLink | null = null,
  prompt: string | null = null,
): string {
  const quoted = skill ? ` "${skill.replace(/["\\$`]/g, '\\$&')}"` : '';
  const system = [link ? BOARD_PROMPT : null, prompt].filter((line) => line !== null).join(' ');
  const flags = [
    ...(link ? ['--settings', link.settingsPath] : []),
    ...(system ? ['--append-system-prompt', system] : []),
  ];
  const claude = commandLine('claude', flags);
  const env = link ? `${TARGET_ENV}=${commandLine('', [link.target]).trimStart()} ` : '';
  return `${commandLine('cd', [cwd])} && ${env}${claude}${quoted}`;
}
