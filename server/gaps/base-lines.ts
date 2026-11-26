import type { Gap } from '@contract/gap';
import type { RepoConfig } from '@contract/repo';
import type { Sky, System } from '@contract/sky';
import type { CommandRunner } from '#server/core/runner.ts';
import { originBranches } from '#server/git/origin.ts';
import type { Deps } from '#server/http/types.ts';
import { gap } from './build.ts';
import { tryReadSky } from './sky.ts';

export async function checkBaseLines(deps: Deps, repo: RepoConfig): Promise<Gap[]> {
  const sky = await tryReadSky(deps, repo);
  if (sky === null) return [];
  const branches = await tryOriginBranches(deps.runner, repo.path);
  if (branches === null) return [];
  const gaps: Gap[] = [];
  for (const system of sky.systems) {
    if (system.base === null || branches.includes(system.base)) continue;
    gaps.push(
      gap(
        `base-${system.id}`,
        'repo',
        'thin',
        { code: 'base-off-origin', handle: system.handle },
        { command: `git push origin ${system.base}` },
        [],
        [],
        [system.id, ...inheritors(sky, system)],
      ),
    );
  }
  return gaps;
}

function inheritors(sky: Sky, system: System): string[] {
  const ids = sky.tickets.filter((t) => t.systemId === system.id).map((t) => t.id);
  for (const child of sky.systems) {
    if (child.parentId !== system.id || child.base !== null) continue;
    ids.push(child.id, ...inheritors(sky, child));
  }
  return ids;
}

async function tryOriginBranches(
  runner: CommandRunner,
  checkout: string,
): Promise<string[] | null> {
  try {
    return (await originBranches(runner, checkout)).branches;
  } catch {
    return null;
  }
}
