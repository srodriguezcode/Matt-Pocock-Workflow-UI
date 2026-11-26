import { dirname, join } from 'node:path';
import type { FileSystem } from '#server/core/fs.ts';
import type { Launch } from './identity.ts';
import type { LinkedTarget } from '@contract/launch';
import { isStarKind } from './target.ts';

export interface LaunchStore {
  load(): Promise<Launch[]>;
  save(launches: Launch[]): Promise<void>;
}

export function launchesPath(home: string): string {
  return join(home, '.config', 'ui-agent-workflow', 'launches.json');
}

/** A broken file loads as no launches: it only costs typed Delivery until the next Start. */
export function fileLaunchStore(fs: FileSystem, path: string): LaunchStore {
  return {
    async load() {
      const text = await fs.read(path);
      if (text === null) return [];
      try {
        const parsed: unknown = JSON.parse(text);
        return Array.isArray(parsed) ? parsed.filter(isLaunch) : [];
      } catch {
        return [];
      }
    },
    async save(launches) {
      await fs.mkdir(dirname(path));
      await fs.write(path, `${JSON.stringify(launches, null, 2)}\n`);
    },
  };
}

function isLaunch(value: unknown): value is Launch {
  const launch = value as Partial<Launch> | null;
  return (
    typeof launch?.repo === 'string' &&
    typeof launch.cwd === 'string' &&
    isTarget(launch.target) &&
    (typeof launch.terminal === 'string' || launch.terminal === null)
  );
}

function isTarget(value: unknown): value is LinkedTarget {
  const target = value as { kind?: unknown; id?: unknown; key?: unknown; title?: unknown } | null;
  if (target?.kind === 'session') {
    return typeof target.key === 'string' && typeof target.title === 'string';
  }
  return typeof target?.id === 'string' && isStarKind(target.kind);
}
