import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { checkComments } from './comments.ts';
import { checkCopy } from './copy.ts';
import { checkImports } from './imports.ts';

const bin = (name: string) => `node_modules/.bin/${name}`;

const steps: [string, string[]][] = [
  [bin('prettier'), ['--check', '.', '--log-level', 'warn']],
  [bin('ngc'), ['-p', 'tsconfig.app.json']],
  [bin('tsc'), ['-p', 'tsconfig.spec.json']],
  [bin('tsc'), ['-p', 'tsconfig.server.json']],
  [bin('vitest'), ['run', '--reporter', 'dot']],
  ['node', ['scripts/build-demo.ts']],
];

let failed = false;
for (const [command, args] of steps) {
  console.log(`> ${command.replace('node_modules/.bin/', '')} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

console.log('> comment check');
const tracked = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' });
const files = tracked.stdout
  .split('\n')
  .filter((file) => /\.(m?[jt]s|html|s?css)$/.test(file) && !file.startsWith('skills/'))
  .filter((file) => existsSync(file));
const violations = files.flatMap((file) => checkComments(file, readFileSync(file, 'utf8')));
for (const v of violations) console.error(`${v.file}:${v.line}  ${v.message}`);
if (violations.length > 0) failed = true;

console.log('> import check');
const importFiles = files.filter((file) => /\.ts$/.test(file) && !file.startsWith('skills/'));
const importViolations = importFiles.flatMap((file) =>
  checkImports(file, readFileSync(file, 'utf8')),
);
for (const v of importViolations) console.error(`${v.file}:${v.line}  ${v.message}`);
if (importViolations.length > 0) failed = true;

console.log('> copy check');
const copyFiles = files.filter((file) => file.startsWith('src/app/') && /\.(html|ts)$/.test(file));
const copyViolations = copyFiles.flatMap((file) => checkCopy(file, readFileSync(file, 'utf8')));
for (const v of copyViolations) console.error(`${v.file}:${v.line}  ${v.message}`);
if (copyViolations.length > 0) failed = true;

process.exit(failed ? 1 : 0);
