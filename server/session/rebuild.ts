import { relative } from 'node:path';
import type { RepoConfig } from '@contract/repo';
import { readConfig, worktreeDir } from '#server/config/store.ts';
import type { Deps } from '#server/http/types.ts';
import { skyFor } from '#server/sky/read.ts';
import { trackerFor } from '#server/tracker/pick.ts';
import { within } from './identity.ts';
import type { LinkTarget } from './target.ts';

/** After a board restart: the target a Session's `cwd` belongs to, when it is a Start's worktree. */
export async function identifyByCwd(deps: Deps, cwd: string): Promise<LinkTarget | null> {
  try {
    const { repos } = await readConfig(deps.fs, deps.home);
    for (const repo of repos) {
      const slug = slugOf(repo, cwd);
      if (slug === null) continue;
      const tracker = await trackerFor(deps, repo);
      const { sky } = await skyFor(deps, repo, tracker);
      const system = sky.systems.find((s) => tracker.branchSlug(s) === slug);
      if (system) return { repo: repo.path, target: { kind: 'system', id: system.id } };
      const ticket = sky.tickets.find((t) => tracker.branchSlug(t) === slug);
      if (ticket) return { repo: repo.path, target: { kind: 'ticket', id: ticket.id } };
    }
  } catch {
    return null;
  }
  return null;
}

function slugOf(repo: RepoConfig, cwd: string): string | null {
  const root = worktreeDir(repo);
  if (!within(cwd, root)) return null;
  const branchPath = relative(root, cwd);
  const prefixes = [repo.fallbackPrefix, ...repo.branchPrefixes.map((p) => p.prefix)];
  for (const prefix of prefixes) {
    if (!branchPath.startsWith(`${prefix}/`)) continue;
    const slug = branchPath.slice(prefix.length + 1).split('/')[0];
    if (slug) return slug;
  }
  return null;
}
