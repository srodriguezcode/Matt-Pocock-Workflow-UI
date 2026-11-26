import type { CommandRunner } from '#server/core/runner.ts';

/** One interactive Session `claude agents --json` lists. */
export interface AgentEntry {
  sessionId: string;
  pid: number;
  cwd: string;
  busy: boolean;
}

interface RawAgent {
  kind?: unknown;
  pid?: unknown;
  sessionId?: unknown;
  cwd?: unknown;
  status?: unknown;
}

/** The interactive entries, or `null` when `stdout` is not the listing. */
export function parseAgents(stdout: string): AgentEntry[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return (parsed as (RawAgent | null)[]).flatMap((raw) =>
    raw?.kind === 'interactive' && typeof raw.pid === 'number' && typeof raw.sessionId === 'string'
      ? [
          {
            sessionId: raw.sessionId,
            pid: raw.pid,
            cwd: typeof raw.cwd === 'string' ? raw.cwd : '',
            busy: raw.status === 'busy',
          },
        ]
      : [],
  );
}

/** `null` when the command fails, so a failed read never marks a Session Lost. */
export async function readAgents(
  runner: CommandRunner,
  agents: { command: string; args: string[] },
): Promise<AgentEntry[] | null> {
  const result = await runner.run(agents.command, agents.args, { timeoutMs: 10_000 });
  return result.code === 0 ? parseAgents(result.stdout) : null;
}
