import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

mkdirSync('demo/out', { recursive: true });
run('node', ['scripts/demo/snapshot.ts']);
run('node_modules/.bin/ng', ['build', '--configuration', 'demo']);
