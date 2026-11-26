import type { StarTarget } from '@contract/launch';
import { decodeTarget, type LinkTarget } from './target.ts';

/** A Start this board process opened, remembered so a hook without the target header can be matched. */
export interface Launch {
  repo: string;
  target: StarTarget;
  cwd: string;
  /** The iTerm session id of the tab Start opened, or `null` when it could not be read. */
  terminal: string | null;
}

/** The header wins, then a Start whose worktree is `cwd`. `null` is a hand-started session. */
export function identify(
  header: string | undefined,
  cwd: string,
  launches: Launch[],
): LinkTarget | null {
  const decoded = decodeTarget(header);
  if (decoded) return decoded;
  const launch = launches.findLast((l) => l.cwd !== l.repo && within(cwd, l.cwd));
  return launch ? { repo: launch.repo, target: launch.target } : null;
}

export function within(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir.endsWith('/') ? dir : `${dir}/`);
}
