import { basename, dirname, join } from 'node:path';
import type { FileSystem } from '#server/core/fs.ts';
import type { AttributionContext, ModelUsage, Session } from './session.ts';

interface Line {
  type?: string;
  timestamp?: string;
  cwd?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  turnOrigin?: string;
  origin?: { kind?: string };
  message?: {
    id?: string;
    model?: string;
    content?: string | { type?: string; text?: unknown }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation?: { ephemeral_1h_input_tokens?: number };
    };
  };
}

interface Raw {
  id: string;
  lines: Line[];
  subagents: Line[];
}

/** An unreadable file or folder is skipped, so one bad path can't sink the whole reading. */
export async function readSessions(
  fs: FileSystem,
  root: string,
  context: AttributionContext,
): Promise<Session[]> {
  const checkout = encodeCwd(context.checkout);
  const worktrees = encodeCwd(context.worktreeRoot);
  const dirs = (await tryRead(() => fs.list(root))) ?? [];
  const paths = await Promise.all(
    dirs
      .filter((d) => d.dir && (d.name === checkout || d.name.startsWith(`${worktrees}-`)))
      .map((d) => transcriptsIn(fs, join(root, d.name))),
  );
  const raws = await Promise.all(
    paths
      .flat()
      .sort()
      .map((path) => readRaw(fs, path)),
  );
  const seen = new Set<string>();
  const sessions: Session[] = [];
  for (const raw of raws) {
    const session = raw && toSession(raw, context, seen);
    if (session) sessions.push(session);
  }
  return sessions;
}

/** Claude Code's project folder name, which is lossy, so it only narrows the folders read. */
function encodeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

async function tryRead<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

async function transcriptsIn(fs: FileSystem, dir: string): Promise<string[]> {
  const files = (await tryRead(() => fs.list(dir))) ?? [];
  return files.filter((f) => !f.dir && f.name.endsWith('.jsonl')).map((f) => join(dir, f.name));
}

async function readRaw(fs: FileSystem, path: string): Promise<Raw | null> {
  const text = await tryRead(() => fs.read(path));
  if (text === null) return null;
  const id = basename(path, '.jsonl');
  const subagentFiles = await transcriptsIn(fs, join(dirname(path), id, 'subagents'));
  const subagents = await Promise.all(
    subagentFiles.sort().map(async (file) => parseLines(await tryRead(() => fs.read(file)))),
  );
  return { id, lines: parseLines(text), subagents: subagents.flat() };
}

/**
 * `--fork-session` copies earlier messages, ids and all, so `seen` spans the reading in path order.
 * A turn made only of copied messages adds no Working time.
 */
function toSession(raw: Raw, context: AttributionContext, seen: Set<string>): Session | null {
  const cwd = raw.lines.find((line) => typeof line.cwd === 'string')?.cwd;
  if (cwd === undefined) return null;
  if (cwd !== context.checkout && !cwd.startsWith(`${context.worktreeRoot}/`)) return null;
  const main = raw.lines.filter((line) => !line.isSidechain);
  const firstPrompt = main.find(isHumanPrompt);
  const workingMs = workingMsOf(main, seen);
  return {
    id: raw.id,
    cwd,
    prompt: firstPrompt ? promptText(firstPrompt) : null,
    usage: usageOf([...raw.lines, ...raw.subagents], seen),
    workingMs,
  };
}

/** A live Session may be mid-write, so a line that doesn't parse is dropped, not fatal. */
function parseLines(text: string | null): Line[] {
  const lines: Line[] = [];
  for (const raw of (text ?? '').split('\n')) {
    if (!raw.trim()) continue;
    try {
      const line: unknown = JSON.parse(raw);
      if (line && typeof line === 'object') lines.push(line as Line);
    } catch {
      continue;
    }
  }
  return lines;
}

/** Claude Code writes one API message as several lines that repeat its `message.id` and usage. */
function usageOf(lines: Line[], seen: Set<string>): ModelUsage[] {
  const byModel = new Map<string, Required<ModelUsage>>();
  for (const line of lines) {
    const message = line.message;
    if (line.type !== 'assistant' || !message?.usage || !message.model) continue;
    if (message.id !== undefined) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
    }
    const u = message.usage;
    const counts = {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheCreation: u.cache_creation_input_tokens ?? 0,
      cacheCreation1h: u.cache_creation?.ephemeral_1h_input_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
    };
    /** Skips the `<synthetic>` messages Claude Code writes itself, which would read as unpriced. */
    if (Object.values(counts).every((n) => n === 0)) continue;
    const total: Required<ModelUsage> = byModel.get(message.model) ?? {
      model: message.model,
      input: 0,
      output: 0,
      cacheCreation: 0,
      cacheCreation1h: 0,
      cacheRead: 0,
    };
    total.input += counts.input;
    total.output += counts.output;
    total.cacheCreation += counts.cacheCreation;
    total.cacheCreation1h += counts.cacheCreation1h;
    total.cacheRead += counts.cacheRead;
    byModel.set(message.model, total);
  }
  return [...byModel.values()];
}

/** Each turn runs from its human prompt to the last assistant line before the next one. */
function workingMsOf(main: Line[], copied: Set<string>): number {
  let total = 0;
  let start: number | null = null;
  let end: number | null = null;
  let fresh = false;
  const close = () => {
    if (fresh && start !== null && end !== null && end > start) total += end - start;
  };
  for (const line of main) {
    const at = line.timestamp ? Date.parse(line.timestamp) : NaN;
    if (Number.isNaN(at)) continue;
    if (isHumanPrompt(line)) {
      close();
      start = at;
      end = null;
      fresh = false;
    } else if (line.type === 'assistant') {
      end = at;
      const id = line.message?.id;
      if (id === undefined || !copied.has(id)) fresh = true;
    }
  }
  close();
  return total;
}

/**
 * Tool results, skill bodies and task notifications are user lines too, and none starts a turn.
 * Older transcripts carry no `turnOrigin`, so the content decides.
 */
function isHumanPrompt(line: Line): boolean {
  if (line.type !== 'user' || line.isSidechain || line.isMeta) return false;
  const origin = line.turnOrigin ?? line.origin?.kind;
  if (origin !== undefined) return origin === 'human';
  const content = line.message?.content;
  if (typeof content === 'string') return !content.startsWith('<task-notification>');
  return Array.isArray(content) && content.some((block) => block?.type !== 'tool_result');
}

function promptText(line: Line): string {
  const content = line.message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n');
}
