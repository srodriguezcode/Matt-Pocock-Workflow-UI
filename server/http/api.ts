import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiError } from '@contract/api';
import type { LaunchEvent } from '@contract/launch';
import { routes } from './router.ts';
import { HttpError, type ApiRequest, type Deps } from './types.ts';

/** Keeps idle SSE connections open through proxies that close silent ones. */
const HEARTBEAT_MS = 25_000;

export async function handleApi(
  deps: Deps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const handler = routes[`${req.method} ${url.pathname}`];
  const hangUp = new AbortController();
  res.on('close', () => hangUp.abort());
  try {
    if (!handler) throw new HttpError(404, `no route ${req.method} ${url.pathname}`);
    const request: ApiRequest = {
      method: req.method ?? 'GET',
      path: url.pathname,
      query: url.searchParams,
      body: await readJson(req),
      headers: headersOf(req),
      signal: hangUp.signal,
    };
    const reply = await handler(deps, request);
    if (hangUp.signal.aborted) return;
    if ('events' in reply) {
      res.writeHead(reply.status, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const beat = setInterval(() => res.write(':\n\n'), HEARTBEAT_MS);
      try {
        for await (const value of reply.events) res.write(`data: ${JSON.stringify(value)}\n\n`);
      } finally {
        clearInterval(beat);
        res.end();
      }
      return;
    }
    if ('stream' in reply) {
      res.writeHead(reply.status, { 'content-type': 'application/x-ndjson' });
      try {
        for await (const value of reply.stream) res.write(`${JSON.stringify(value)}\n`);
      } catch (error) {
        console.error(error);
        const end: LaunchEvent = {
          type: 'end',
          ok: false,
          outcome: { code: 'crashed', error: (error as Error).message },
        };
        res.write(`${JSON.stringify(end)}\n`);
      }
      res.end();
      return;
    }
    send(res, reply.status, reply.body);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    const body: ApiError = { error: (error as Error).message };
    if (error instanceof HttpError && error.reason) body.reason = error.reason;
    if (error instanceof HttpError && error.gap) body.gap = error.gap;
    if (res.headersSent) res.end();
    else send(res, status, body);
  }
}

function headersOf(req: IncomingMessage): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    out[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  let text = '';
  for await (const chunk of req) text += String(chunk);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'body is not JSON');
  }
}
