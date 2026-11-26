import { join } from 'node:path';
import type { CostReading } from '@contract/cost';
import type { RepoConfig } from '@contract/repo';
import type { Sky } from '@contract/sky';
import { worktreeDir } from '#server/config/store.ts';
import type { Deps } from '#server/http/types.ts';
import type { Tracker } from '#server/tracker/tracker.ts';
import { attribute } from './attribute.ts';
import { costMembers } from './members.ts';
import { costReading } from './reading.ts';
import type { AttributionContext } from './session.ts';
import { readSessions } from './transcripts.ts';

/** `CLAUDE_CONFIG_DIR` moves it, which is how the container points at the Sessions' shared volume. */
export function transcriptRoot(home: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(env['CLAUDE_CONFIG_DIR'] || join(home, '.claude'), 'projects');
}

/** Read on demand and kept nowhere, so every call scans the transcripts again. */
export async function readCost(
  deps: Deps,
  repo: RepoConfig,
  tracker: Tracker,
  sky: Sky,
  id: string,
): Promise<CostReading> {
  const context: AttributionContext = {
    tracker: tracker.kind,
    checkout: repo.path,
    worktreeRoot: worktreeDir(repo),
    mapId: sky.mapId,
    systemIds: sky.systems.map((system) => system.id),
  };
  const [members, sessions] = await Promise.all([
    costMembers(tracker, sky, id),
    readSessions(deps.fs, transcriptRoot(deps.home), context),
  ]);
  const attributed = sessions.map((session) => ({
    ...session,
    issueId: attribute(session, context),
  }));
  return costReading(id, members, attributed);
}
