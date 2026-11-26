import { spawn } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  input?: string;
  timeoutMs?: number;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Every outside command (`gh`, `git`, `osascript`, `which`) goes through this, so tests can fake it. */
export interface CommandRunner {
  run(command: string, args: string[], options?: RunOptions): Promise<RunResult>;
}

export const processRunner: CommandRunner = {
  run(command, args, options = {}) {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        stdio: 'pipe',
        timeout: options.timeoutMs ?? 120_000,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', (error) => resolve({ code: 127, stdout, stderr: stderr + error.message }));
      child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
      /** A child that exits before reading its input closes the pipe, and an unheard EPIPE ends the board. */
      child.stdin.on('error', () => {});
      child.stdin.end(options.input ?? '');
    });
  },
};

/** Renders a command the way the sheet and rollback lines show it. */
export function commandLine(command: string, args: string[]): string {
  return [command, ...args.map(quoteArg)].join(' ');
}

function quoteArg(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}
