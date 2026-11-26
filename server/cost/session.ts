import type { TrackerKind } from '@contract/repo';
import type { CloseReason } from '#server/tracker/tracker.ts';

export interface ModelUsage {
  model: string;
  input: number;
  output: number;
  cacheCreation: number;
  /** The part of `cacheCreation` written for an hour, which costs more. */
  cacheCreation1h: number;
  cacheRead: number;
}

export interface Session {
  id: string;
  /** The first `cwd` the transcript records, which is where Start opened it. */
  cwd: string;
  /** The first human prompt as recorded, slash-command markup included. */
  prompt: string | null;
  usage: ModelUsage[];
  workingMs: number;
}

export interface AttributedSession extends Session {
  /** `null` when no Start opened the Session. */
  issueId: string | null;
}

export interface AttributionContext {
  tracker: TrackerKind;
  checkout: string;
  /** Absolute. Build Starts open their Session at `<worktreeRoot>/<prefix>/<slug>`. */
  worktreeRoot: string;
  mapId: string | null;
  systemIds: string[];
}

export interface CostMember {
  id: string;
  handle: string;
  closed: boolean;
  closeReason: CloseReason | null;
  /** The System above it in this reading. `null` for the issue read. */
  parentId: string | null;
  system: boolean;
}
