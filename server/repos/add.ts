import type { AddRepoRequest } from '@contract/api';
import type { Config, RepoConfig, Tile } from '@contract/repo';
import { readConfig, withDefaults, writeConfig } from '#server/config/store.ts';
import { REPOS_ROOT } from '#server/core/runtime.ts';
import type { FileSystem } from '#server/core/fs.ts';
import type { CommandRunner } from '#server/core/runner.ts';
import type { Runtime } from '@contract/runtime';
import { HttpError } from '#server/http/types.ts';
import { parseGithubRemote } from '#server/git/origin.ts';

/** The checkout's toplevel and its GitHub `owner/repo`, or the reason it can't be added. */
export async function checkoutRepo(
  runner: CommandRunner,
  path: string,
): Promise<{ path: string; owner: string; name: string }> {
  const top = await runner.run('git', ['-C', path, 'rev-parse', '--show-toplevel']);
  if (top.code !== 0)
    throw new HttpError(400, `${path} is not a git checkout`, {
      reason: { code: 'not-a-checkout', path },
    });
  const toplevel = top.stdout.trim();
  const remote = await runner.run('git', ['-C', toplevel, 'remote', 'get-url', 'origin']);
  if (remote.code !== 0)
    throw new HttpError(400, `${toplevel} has no origin remote`, {
      reason: { code: 'no-origin', path: toplevel },
    });
  const github = parseGithubRemote(remote.stdout);
  if (!github)
    throw new HttpError(400, 'origin is not on GitHub', {
      reason: { code: 'origin-not-github' },
    });
  return { path: toplevel, ...github };
}

/** Appends a repo to `config`, refusing a checkout path already in it. */
export function planAddRepo(
  config: Config,
  checkout: { path: string; owner: string; name: string },
  body: AddRepoRequest,
): { config: Config; repo: RepoConfig } {
  if (config.repos.some((repo) => repo.path === checkout.path))
    throw new HttpError(409, `${checkout.path} is already added`, {
      reason: { code: 'already-added', path: checkout.path },
    });
  if (body.tile !== undefined && !isTile(body.tile)) {
    throw new HttpError(400, 'tile must be 1 or 2 letters or a data:image/ URL', {
      reason: { code: 'bad-tile' },
    });
  }
  const repo = withDefaults({ ...checkout, ...(body.tile ? { tile: body.tile } : {}) });
  return { config: { ...config, repos: [...config.repos, repo] }, repo };
}

export function isTile(tile: unknown): tile is Tile {
  const { letters, image } = (tile ?? {}) as Record<string, unknown>;
  if (typeof letters === 'string') return letters.length >= 1 && letters.length <= 2;
  return typeof image === 'string' && image.startsWith('data:image/');
}

export interface AddRepoDeps {
  runner: CommandRunner;
  fs: FileSystem;
  home: string;
  runtime: Runtime;
}

/** A part may not start with `-`, which `gh repo clone` would read as a flag. */
const OWNER_NAME = /^[\w.][\w.-]*\/[\w.][\w.-]*$/;

function notARepo(repo: string): HttpError {
  return new HttpError(400, `${repo} is not a GitHub repo`, {
    reason: { code: 'not-a-repo', repo },
  });
}

/** GitHub names ignore case, so a lowercase folder keeps one clone per repo. */
async function cloneRepo(runner: CommandRunner, input: string) {
  const github = input.toLowerCase();
  if (!OWNER_NAME.test(github) || github.split('/').some((part) => /^\.+$/.test(part)))
    throw notARepo(github);
  const dir = `${REPOS_ROOT}/${github}`;
  const existing = await runner.run('git', ['-C', dir, 'rev-parse', '--show-toplevel']);
  if (existing.code !== 0) {
    const clone = await runner.run('gh', [
      'repo',
      'clone',
      github,
      dir,
      '--',
      '--filter=blob:none',
    ]);
    if (clone.code !== 0) throw notARepo(github);
  }
  return checkoutRepo(runner, dir);
}

export async function addRepo(deps: AddRepoDeps, body: AddRepoRequest): Promise<RepoConfig> {
  let checkout;
  if ('github' in body) {
    if (deps.runtime !== 'container')
      throw new HttpError(400, 'adding by owner/name needs the container runtime', {
        reason: { code: 'by-name-needs-container' },
      });
    checkout = await cloneRepo(deps.runner, body.github);
  } else {
    checkout = await checkoutRepo(deps.runner, body.path);
  }
  const config = await readConfig(deps.fs, deps.home);
  const { config: next, repo } = planAddRepo(config, checkout, body);
  await writeConfig(deps.fs, deps.home, next);
  return repo;
}
