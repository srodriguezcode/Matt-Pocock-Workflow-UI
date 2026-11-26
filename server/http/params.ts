import type { RepoConfig } from '@contract/repo';
import { readConfig } from '#server/config/store.ts';
import { HttpError, type ApiRequest, type Deps } from './types.ts';

export async function repoParam(deps: Deps, req: ApiRequest): Promise<RepoConfig> {
  const path = req.query.get('repo') ?? field(req.body, 'repo');
  if (!path) throw new HttpError(400, 'repo is required');
  const repo = (await readConfig(deps.fs, deps.home)).repos.find((r) => r.path === path);
  if (!repo) {
    throw new HttpError(404, `no repo at ${path}`, { reason: { code: 'unknown-repo', path } });
  }
  return repo;
}

export function stringParam(req: ApiRequest, name: string): string {
  const value = req.query.get(name) ?? field(req.body, name);
  if (!value) throw new HttpError(400, `${name} is required`);
  return value;
}

function field(body: unknown, name: string): string | null {
  const value = (body as Record<string, unknown> | null)?.[name];
  return typeof value === 'string' ? value : null;
}
