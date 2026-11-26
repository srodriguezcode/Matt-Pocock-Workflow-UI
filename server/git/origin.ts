import type { BranchesResponse } from '@contract/api';
import type { CommandRunner } from '#server/core/runner.ts';
import { HttpError } from '#server/http/types.ts';

export async function originBranches(
  runner: CommandRunner,
  checkout: string,
): Promise<BranchesResponse> {
  const heads = await runner.run(
    'git',
    ['ls-remote', '--symref', 'origin', 'HEAD', 'refs/heads/*'],
    {
      cwd: checkout,
    },
  );
  if (heads.code !== 0) throw new Error(heads.stderr.trim() || 'git ls-remote failed');
  const branches: string[] = [];
  let defaultBranch = '';
  for (const line of heads.stdout.split('\n')) {
    const symref = /^ref: refs\/heads\/(\S+)\s+HEAD$/.exec(line);
    if (symref) defaultBranch = symref[1]!;
    const head = /^\w+\s+refs\/heads\/(\S+)$/.exec(line);
    if (head) branches.push(head[1]!);
  }
  if (!defaultBranch) {
    throw new HttpError(502, 'origin has no HEAD', { reason: { code: 'no-origin-head' } });
  }
  return { branches: branches.sort(), defaultBranch };
}

/** `owner/repo` from a GitHub `origin` URL, or `null` when origin isn't GitHub. */
export function parseGithubRemote(url: string): { owner: string; name: string } | null {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match ? { owner: match[1]!, name: match[2]! } : null;
}
