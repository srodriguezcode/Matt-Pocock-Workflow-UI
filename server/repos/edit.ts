import type { ApiErrorReason } from '@contract/api';
import type { BranchPrefix, CanonicalLabel, Config, LabelRemaps, RepoConfig } from '@contract/repo';
import { readConfig, writeConfig } from '#server/config/store.ts';
import type { FileSystem } from '#server/core/fs.ts';
import { HttpError } from '#server/http/types.ts';
import { isTile } from './add.ts';

const CANONICAL: Record<CanonicalLabel, true> = {
  'ready-for-agent': true,
  'ready-for-human': true,
  'needs-triage': true,
  'needs-info': true,
  'to-be-confirmed': true,
  spec: true,
  'wayfinder:map': true,
  'wayfinder:': true,
};

export function planEditRepo(config: Config, body: unknown): { config: Config; repo: RepoConfig } {
  const edit = (body ?? {}) as Record<string, unknown>;
  const { path, tile } = edit;
  if (typeof path !== 'string') throw new HttpError(400, 'path is required');
  const saved = config.repos.find((repo) => repo.path === path);
  if (!saved) throw refuse(404, `no repo at ${path}`, { code: 'unknown-repo', path });
  if (edit['owner'] !== saved.owner || edit['name'] !== saved.name)
    throw refuse(400, 'owner and name come from origin', { code: 'fixed-identity', path });
  if (!isTile(tile))
    throw refuse(400, 'tile must be 1 or 2 letters or a data:image/ URL', { code: 'bad-tile' });
  const repo: RepoConfig = {
    path,
    owner: saved.owner,
    name: saved.name,
    ...baseBranch(edit['baseBranch']),
    branchPrefixes: branchPrefixes(edit['branchPrefixes']),
    fallbackPrefix: prefix(edit['fallbackPrefix']),
    ...worktreeDir(edit['worktreeDir']),
    labels: labels(edit['labels']),
    tile,
  };
  const repos = config.repos.map((entry) => (entry.path === path ? repo : entry));
  return { config: { ...config, repos }, repo };
}

/** Drops the config entry only. The checkout and its worktrees stay on disk. */
export function planRemoveRepo(config: Config, path: string): Config {
  if (!config.repos.some((repo) => repo.path === path))
    throw refuse(404, `no repo at ${path}`, { code: 'unknown-repo', path });
  return { ...config, repos: config.repos.filter((repo) => repo.path !== path) };
}

/** The Rail order is the order of `config.repos`, so a reorder rewrites that array. */
export function planReorderRepos(config: Config, body: unknown): Config {
  const { paths } = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(paths)) throw new HttpError(400, 'paths must be a list');
  const byPath = new Map(config.repos.map((repo) => [repo.path, repo]));
  const repos = [...new Set(paths)].flatMap((path) => byPath.get(path) ?? []);
  if (repos.length !== paths.length || repos.length !== config.repos.length)
    throw refuse(400, 'paths must name every repo once', { code: 'bad-repo-order' });
  return { ...config, repos };
}

function baseBranch(value: unknown): Pick<RepoConfig, 'baseBranch'> {
  if (value === undefined) return {};
  if (typeof value !== 'string' || !value.split('/').every(isRefComponent))
    throw refuse(400, 'base branch is not a valid branch name', {
      code: 'bad-base-branch',
      branch: String(value),
    });
  return { baseBranch: value };
}

function branchPrefixes(value: unknown): BranchPrefix[] {
  if (!Array.isArray(value)) throw new HttpError(400, 'branchPrefixes must be a list');
  return value.map((entry: unknown) => {
    const { label, prefix: raw } = (entry ?? {}) as Record<string, unknown>;
    if (typeof label !== 'string' || !label.trim())
      throw refuse(400, 'a branch prefix has no label', { code: 'blank-prefix-label' });
    return { label, prefix: prefix(raw) };
  });
}

/** A prefix is one ref component: `<prefix>/<number>` names the branch and its worktree folder. */
function prefix(value: unknown): string {
  if (typeof value !== 'string' || !isRefComponent(value))
    throw refuse(400, 'branch prefix is not a valid ref component', {
      code: 'bad-branch-prefix',
      prefix: String(value ?? ''),
    });
  return value;
}

function worktreeDir(value: unknown): Pick<RepoConfig, 'worktreeDir'> {
  if (value === undefined) return {};
  if (typeof value !== 'string' || !value.trim())
    throw refuse(400, 'worktreeDir must be a path', { code: 'bad-worktree-dir' });
  return { worktreeDir: value };
}

function labels(value: unknown): LabelRemaps {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new HttpError(400, 'labels must be an object');
  const remaps: LabelRemaps = {};
  for (const [label, name] of Object.entries(value)) {
    if (!Object.hasOwn(CANONICAL, label))
      throw refuse(400, `${label} is not a canonical label`, { code: 'unknown-label', label });
    if (typeof name !== 'string' || !name.trim())
      throw refuse(400, `${label} is remapped to nothing`, { code: 'blank-label-remap', label });
    remaps[label as CanonicalLabel] = name;
  }
  return remaps;
}

/** `git check-ref-format`'s rules for one slash-free part of a branch name. */
function isRefComponent(part: string): boolean {
  return (
    part.length > 0 &&
    part !== '@' &&
    !part.startsWith('.') &&
    !part.endsWith('.') &&
    !part.endsWith('.lock') &&
    !part.includes('..') &&
    !part.includes('@{') &&
    !/[\x00-\x20\x7f~^:?*[\\/]/.test(part)
  );
}

function refuse(status: number, message: string, reason: ApiErrorReason): HttpError {
  return new HttpError(status, message, { reason });
}

export interface EditRepoDeps {
  fs: FileSystem;
  home: string;
}

export async function editRepo(deps: EditRepoDeps, body: unknown): Promise<RepoConfig> {
  const { config, repo } = planEditRepo(await readConfig(deps.fs, deps.home), body);
  await writeConfig(deps.fs, deps.home, config);
  return repo;
}

export async function removeRepo(deps: EditRepoDeps, path: string): Promise<RepoConfig[]> {
  const config = planRemoveRepo(await readConfig(deps.fs, deps.home), path);
  await writeConfig(deps.fs, deps.home, config);
  return config.repos;
}

export async function reorderRepos(deps: EditRepoDeps, body: unknown): Promise<RepoConfig[]> {
  const config = planReorderRepos(await readConfig(deps.fs, deps.home), body);
  await writeConfig(deps.fs, deps.home, config);
  return config.repos;
}
