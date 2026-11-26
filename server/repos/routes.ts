import type { AddRepoRequest } from '@contract/api';
import { readConfig } from '#server/config/store.ts';
import { originBranches } from '#server/git/origin.ts';
import { repoParam, stringParam } from '#server/http/params.ts';
import { ok, type Handler } from '#server/http/types.ts';
import { addRepo } from './add.ts';
import { editRepo, removeRepo, reorderRepos } from './edit.ts';

export const listReposRoute: Handler = async (deps) =>
  ok((await readConfig(deps.fs, deps.home)).repos);

/** `POST /api/repos` `AddRepoRequest` → `RepoConfig`. */
export const addRepoRoute: Handler = async (deps, req) =>
  ok(await addRepo(deps, req.body as AddRepoRequest));

/** `PUT /api/repos` edited `RepoConfig`, matched by `path` → the saved `RepoConfig`. */
export const editRepoRoute: Handler = async (deps, req) => ok(await editRepo(deps, req.body));

/** `DELETE /api/repos?path=` → the repos left. */
export const removeRepoRoute: Handler = async (deps, req) =>
  ok(await removeRepo(deps, stringParam(req, 'path')));

/** `PUT /api/repos/order` `ReorderReposRequest` → the repos in the new order. */
export const reorderReposRoute: Handler = async (deps, req) =>
  ok(await reorderRepos(deps, req.body));

export const branchesRoute: Handler = async (deps, req) => {
  const repo = await repoParam(deps, req);
  return ok(await originBranches(deps.runner, repo.path));
};
