import type { ApiErrorReason } from '@contract/api';
import type { Gap } from '@contract/gap';
import type { Runtime } from '@contract/runtime';
import type { FileSystem } from '#server/core/fs.ts';
import type { CommandRunner } from '#server/core/runner.ts';
import type { SessionHub } from '#server/session/hub.ts';

/** Where a Session's hooks reach the board and how `claude agents --json` runs. Config, so the container can set both. */
export interface LinkConfig {
  /** An origin with no path or trailing slash, such as `http://127.0.0.1:4200`. Hook paths append to it. */
  hookBase: string;
  /** The board-owned settings file Start passes with `--settings`. */
  settingsPath: string;
  agents: { command: string; args: string[] };
}

export interface Deps {
  runner: CommandRunner;
  fs: FileSystem;
  home: string;
  now(): Date;
  link: LinkConfig;
  sessions: SessionHub;
  runtime: Runtime;
  /** `CLAUDE_CONFIG_DIR`, set in the container. `null` means Claude's own `~/.claude` and `~/.claude.json`. */
  claudeConfigDir: string | null;
}

export interface ApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  /** Lower-case names, as Node reads them. */
  headers: Record<string, string | undefined>;
  /** Aborts when the caller hangs up, so a held reply can let go. */
  signal: AbortSignal;
}

/** A JSON reply, newline-delimited JSON streamed one value per line, or server-sent events. */
export type Reply =
  | { status: number; body: unknown }
  | { status: number; stream: AsyncIterable<unknown> }
  | { status: number; events: AsyncIterable<unknown> };

export type Handler = (deps: Deps, req: ApiRequest) => Promise<Reply>;

export class HttpError extends Error {
  readonly status: number;
  readonly gap: Gap | undefined;
  readonly reason: ApiErrorReason | undefined;

  constructor(
    status: number,
    message: string,
    detail: { gap?: Gap; reason?: ApiErrorReason } = {},
  ) {
    super(message);
    this.status = status;
    this.gap = detail.gap;
    this.reason = detail.reason;
  }
}

export const ok = (body: unknown): Reply => ({ status: 200, body });

export const notBuilt: Handler = async (_deps, req) => {
  throw new HttpError(501, `${req.method} ${req.path} is not built yet`);
};
