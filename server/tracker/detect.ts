import { join } from 'node:path';
import type { TrackerKind } from '@contract/repo';
import type { FileSystem } from '#server/core/fs.ts';

export type Detected = TrackerKind | 'missing' | 'unsupported';

export const TRACKER_FILE = 'docs/agents/issue-tracker.md';

export async function detectTracker(fs: FileSystem, checkout: string): Promise<Detected> {
  return classify(await fs.read(join(checkout, TRACKER_FILE)));
}

export function classify(text: string | null): Detected {
  if (text === null) return 'missing';
  const title = /^#\s+Issue tracker:\s*(.+)$/im.exec(text)?.[1]?.trim().toLowerCase();
  if (title === 'github') return 'github';
  if (title === 'local markdown') return 'scratch';
  return 'unsupported';
}
