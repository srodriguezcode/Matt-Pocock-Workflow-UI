import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { nodeFs } from './core/fs.ts';
import { processRunner } from './core/runner.ts';
import { runtimeOf } from './core/runtime.ts';
import { handleApi } from './http/api.ts';
import { allowRequest } from './http/guard.ts';
import { TAB_CLOSED, typePrompt } from './launch/commands.ts';
import { typeIntoTmux } from './launch/tmux.ts';
import { serveStatic } from './http/static.ts';
import type { Deps, LinkConfig } from './http/types.ts';
import { readAgents } from './session/agents.ts';
import { SessionHub } from './session/hub.ts';
import { fileLaunchStore, launchesPath } from './session/launch-store.ts';
import { identifyByCwd } from './session/rebuild.ts';
import { sessionSettingsPath, writeSessionSettings } from './session/settings-file.ts';

const port = Number(process.env['PORT'] ?? 4200);
const dev = process.env['DEV'] === '1';
const noOpen = process.argv.includes('--no-open');
const distRoot = join(import.meta.dirname, '..', 'dist');
const home = homedir();
const runtime = runtimeOf(process.env);
const link: LinkConfig = {
  hookBase: `http://127.0.0.1:${port}`,
  settingsPath: sessionSettingsPath(home),
  agents: { command: 'claude', args: ['agents', '--json'] },
};
const sessions = new SessionHub({
  now: () => new Date(),
  readAgents: () => readAgents(processRunner, link.agents),
  identifyByCwd: (cwd) => identifyByCwd(deps, cwd),
  typeInto: async (terminal, text) => {
    if (runtime === 'container') return typeIntoTmux(processRunner, terminal, text);
    const cmd = typePrompt(terminal, text);
    const result = await processRunner.run(cmd.command, cmd.args, { timeoutMs: 10_000 });
    if (result.code === 0) return null;
    if (result.stderr.includes(TAB_CLOSED)) return { code: 'tab-closed' };
    return { code: 'type-failed', stderr: result.stderr.trim() };
  },
  launchStore: fileLaunchStore(nodeFs, launchesPath(home)),
});
const deps: Deps = {
  runner: processRunner,
  fs: nodeFs,
  home,
  now: () => new Date(),
  link,
  sessions,
  runtime,
  claudeConfigDir: process.env['CLAUDE_CONFIG_DIR'] || null,
};

const server = createServer((req, res) => {
  if (req.url?.startsWith('/api/')) {
    if (
      !allowRequest(port, dev, {
        method: req.method ?? 'GET',
        path: new URL(req.url, 'http://localhost').pathname,
        host: req.headers.host,
        origin: req.headers.origin,
      })
    ) {
      res
        .writeHead(403, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: 'forbidden' }));
      return;
    }
    void handleApi(deps, req, res);
    return;
  }
  void (async () => {
    const file = await serveStatic(nodeFs, distRoot, req.url ?? '/');
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': file.contentType });
    res.end(file.body);
  })();
});

await writeSessionSettings(nodeFs, link);
void sessions.start();

/** The container binds 0.0.0.0 because Docker port publishing needs it. The Mac binds only itself. */
const bind = runtime === 'container' ? '0.0.0.0' : '127.0.0.1';

server.listen(port, bind, () => {
  const url = `http://${bind}:${port}`;
  console.log(`UI Agent Workflow on ${url}`);
  if (!noOpen && !dev && runtime === 'mac') void openBrowser(url);
});

async function openBrowser(url: string): Promise<void> {
  const result = await deps.runner.run('open', [url], { timeoutMs: 10_000 });
  if (result.code !== 0) console.error(`open ${url} failed: ${result.stderr.trim()}`);
}
