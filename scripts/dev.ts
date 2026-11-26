import { spawn, type ChildProcess } from 'node:child_process';

const children = new Map<string, ChildProcess>([
  [
    'server',
    spawn('node', ['--watch', 'server/main.ts'], {
      stdio: 'inherit',
      env: { ...process.env, PORT: '8000', DEV: '1' },
    }),
  ],
  ['ng', spawn('node_modules/.bin/ng', ['serve', '--port', '4200'], { stdio: 'inherit' })],
]);

let stopping = false;

const stop = (): void => {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) child.kill('SIGTERM');
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.error(`dev: got ${signal}, stopping children`);
    stop();
  });
}

for (const [name, child] of children) {
  child.on('exit', (code, signal) => {
    const cause = stopping ? ' after stop()' : '';
    console.error(`dev: ${name} exited${cause} (code ${code}, signal ${signal})`);
    stop();
  });
}
