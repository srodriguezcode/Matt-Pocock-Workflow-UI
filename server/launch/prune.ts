import { relative } from 'node:path';
import type { StarTarget } from '@contract/launch';
import type { RepoConfig } from '@contract/repo';
import type { Sky } from '@contract/sky';
import { worktreeDir } from '#server/config/store.ts';
import type { CommandRunner } from '#server/core/runner.ts';
import { within } from '#server/session/identity.ts';
import type { RawGraph, Tracker } from '#server/tracker/tracker.ts';
import { worktreeRemove } from './commands.ts';

export interface PruneInput {
  runner: CommandRunner;
  tracker: Tracker;
  repo: RepoConfig;
  sky: Sky;
  live: StarTarget[];
}

/** Removes closed tickets' and Systems' worktrees. Never throws: a failure is logged. */
export async function pruneWorktrees(input: PruneInput): Promise<void> {
  try {
    await prune(input);
  } catch (error) {
    console.error('prune: worktree cleanup failed', error);
  }
}

async function prune(input: PruneInput): Promise<void> {
  const { runner, repo } = input;
  const root = worktreeDir(repo);
  const listed = await runner.run('git', ['worktree', 'list', '--porcelain'], { cwd: repo.path });
  if (listed.code !== 0) {
    console.error(`prune: git worktree list failed: ${listed.stderr.trim()}`);
    return;
  }
  const candidates = listed.stdout
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .filter((path) => path !== repo.path && within(path, root))
    .flatMap((path) => {
      const slug = slugOf(repo, relative(root, path));
      return slug === null ? [] : [{ path, slug }];
    });
  if (candidates.length === 0) return;
  const graph = once(() => input.tracker.read());
  const closed = await closedIds(input, new Set(candidates.map((c) => c.slug)), graph);
  const liveIds = await liveIdsOf(input, graph);
  for (const { path, slug } of candidates) {
    const id = closed.get(slug);
    if (id === undefined || liveIds.has(id)) continue;
    const cmd = worktreeRemove(path);
    const result = await runner.run(cmd.command, cmd.args, { cwd: repo.path });
    if (result.code !== 0) {
      console.error(`prune: could not remove ${path}: ${result.stderr.trim()}`);
    }
  }
}

async function closedIds(
  input: PruneInput,
  slugs: Set<string>,
  graph: () => Promise<RawGraph>,
): Promise<Map<string, string>> {
  const { sky, tracker } = input;
  const closed = new Map<string, string>();
  const open = new Set<string>();
  for (const system of sky.systems) {
    if (system.closed) closed.set(tracker.branchSlug(system), system.id);
    else open.add(tracker.branchSlug(system));
  }
  for (const ticket of sky.tickets) open.add(tracker.branchSlug(ticket));
  for (const ember of sky.embers) closed.set(tracker.branchSlug(ember), ember.id);
  const unknown = [...slugs].filter((s) => !open.has(s) && !closed.has(s));
  if (unknown.length > 0) {
    for (const issue of (await graph()).issues) {
      const slug = tracker.branchSlug(issue);
      if (issue.state === 'closed' && unknown.includes(slug)) closed.set(slug, issue.id);
    }
  }
  for (const slug of open) closed.delete(slug);
  return closed;
}

/** A live `/implement-parallel` closes its System's tickets as it goes, so they count as live too. */
async function liveIdsOf(input: PruneInput, graph: () => Promise<RawGraph>): Promise<Set<string>> {
  const live = new Set(input.live.map((t) => t.id));
  const systems = new Set(input.live.filter((t) => t.kind === 'system').map((t) => t.id));
  if (systems.size === 0) return live;
  for (const ticket of input.sky.tickets) {
    if (ticket.systemId !== null && systems.has(ticket.systemId)) live.add(ticket.id);
  }
  for (const issue of (await graph()).issues) {
    if (issue.parentId !== null && systems.has(issue.parentId)) live.add(issue.id);
    if (systems.has(issue.id)) for (const child of issue.childIds) live.add(child);
  }
  return live;
}

function once<T>(read: () => Promise<T>): () => Promise<T> {
  let result: Promise<T> | null = null;
  return () => (result ??= read());
}

function slugOf(repo: RepoConfig, branchPath: string): string | null {
  const prefixes = [repo.fallbackPrefix, ...repo.branchPrefixes.map((p) => p.prefix)];
  for (const prefix of prefixes) {
    if (!branchPath.startsWith(`${prefix}/`)) continue;
    const slug = branchPath.slice(prefix.length + 1).split('/')[0];
    if (slug) return slug;
  }
  return null;
}
