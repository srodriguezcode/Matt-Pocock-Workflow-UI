import { mkdir, writeFile } from 'node:fs/promises';
import type { DemoSnapshot } from '@contract/demo';
import { missingStates } from './coverage.ts';
import { readMockRepo } from './mock-repo.ts';
import { snapshotRepo } from './repo-snapshot.ts';

export const REPOS = ['shelf', 'portfolio'];

export async function buildSnapshot(root: string, now: Date): Promise<DemoSnapshot> {
  const repos = [];
  for (const name of REPOS) repos.push(await snapshotRepo(await readMockRepo(root, name), now));
  return { repos };
}

if (import.meta.main) {
  /** Ana's Mac shell, so the build machine's shell never shows in a plan. */
  process.env['SHELL'] = '/bin/zsh';
  const snapshot = await buildSnapshot('demo', new Date());
  const missing = missingStates(snapshot);
  if (missing.length > 0) {
    console.error(`Demo snapshot: no mock repo shows ${missing.join(', ')}`);
    process.exit(1);
  }
  await mkdir('demo/out', { recursive: true });
  await writeFile('demo/out/snapshot.json', `${JSON.stringify(snapshot)}\n`);
}
