import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const OUT = 'docs/media/legend';
const BUNDLE = 'out-tsc/legend.js';

const built = spawnSync(
  'node_modules/.bin/esbuild',
  ['src/app/sky/legend/main.ts', '--bundle', '--tsconfig=tsconfig.json', `--outfile=${BUNDLE}`],
  { stdio: 'inherit' },
);
if (built.status !== 0) process.exit(built.status ?? 1);
mkdirSync(OUT, { recursive: true });

const page = `<!doctype html><meta charset="utf-8"><script>${readFileSync(BUNDLE, 'utf8')}</script>`;

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/html' }).end(page);
    return;
  }
  let body = '';
  req.on('data', (chunk: Buffer) => (body += chunk));
  req.on('end', () => {
    res.writeHead(204).end();
    const name = url.searchParams.get('name');
    if (url.pathname === '/png' && name && /^[a-z-]+$/.test(name)) {
      writeFileSync(`${OUT}/${name}.png`, Buffer.from(body.split(',')[1] ?? '', 'base64'));
      console.log(`${OUT}/${name}.png`);
    }
    if (url.pathname === '/done') server.close();
  });
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`;
  console.log(`Open ${url} in a browser to draw the legend.`);
  if (process.platform === 'darwin' && !process.argv.includes('--no-open'))
    spawnSync('open', [url]);
});
