import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { GapsResponse } from '@contract/api';

/** Repo-relative path to days before the build day. */
export interface Dates {
  created: Record<string, number>;
  claimed: Record<string, number>;
}

/** What `.scratch/` markdown cannot say. Every name in it is an effort, a folder under `.scratch/`. */
export interface Overlay {
  /** Efforts whose tickets are Loose tickets. The effort itself leaves the Sky. */
  loose?: string[];
  blockedBy?: Record<string, string[]>;
}

export interface MockRepo {
  name: string;
  /** Repo-relative path to text, for every file in the folder except `OWN_FILES`. */
  files: Record<string, string>;
  dates: Dates;
  overlay: Overlay;
  gaps: GapsResponse;
  tile: string;
}

const OWN_FILES = new Set(['dates.json', 'overlay.json', 'gaps.json', 'tile.svg']);

export async function readMockRepo(root: string, name: string): Promise<MockRepo> {
  const dir = join(root, name);
  const json = async <T>(file: string): Promise<T> =>
    JSON.parse(await readFile(join(dir, file), 'utf8')) as T;
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = relative(dir, join(entry.parentPath, entry.name));
    if (!OWN_FILES.has(path)) files[path] = await readFile(join(dir, path), 'utf8');
  }
  return {
    name,
    files,
    dates: await json<Dates>('dates.json'),
    overlay: await json<Overlay>('overlay.json'),
    gaps: await json<GapsResponse>('gaps.json'),
    tile: (await readFile(join(dir, 'tile.svg'), 'utf8')).trim(),
  };
}
