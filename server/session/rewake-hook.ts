import { request } from 'node:http';
import { request as secureRequest } from 'node:https';
import {
  HOLD_MARGIN_S,
  HOLD_TIMEOUT_S,
  HOOK_STARTED_HEADER,
  REWAKE_PATH,
  TARGET_ENV,
  TARGET_HEADER,
} from './constants.ts';
import type { RewakeReply } from './routes.ts';

export interface RewakeResponse {
  status: number;
  json(): Promise<unknown>;
}

export type RewakeFetch = (
  url: string,
  init: { headers: Record<string, string>; body: string },
) => Promise<RewakeResponse>;

export interface RewakeRun {
  input: string;
  target: string | undefined;
  base: string;
  fetch: RewakeFetch;
  sleep(ms: number): Promise<void>;
  now(): number;
}

const FIRST_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export async function runRewake(run: RewakeRun): Promise<{ code: 0 | 2; stderr: string }> {
  const started = run.now();
  const deadline = started + (HOLD_TIMEOUT_S - HOLD_MARGIN_S) * 1000;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    [HOOK_STARTED_HEADER]: String(started),
  };
  if (run.target) headers[TARGET_HEADER] = run.target;
  let backoff = FIRST_BACKOFF_MS;
  while (true) {
    const reply = await post(run, headers);
    if (reply !== 'down') {
      return typeof reply === 'string' ? { code: 2, stderr: reply } : { code: 0, stderr: '' };
    }
    if (run.now() + backoff >= deadline) return { code: 0, stderr: '' };
    await run.sleep(backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  }
}

async function post(
  run: RewakeRun,
  headers: Record<string, string>,
): Promise<string | null | 'down'> {
  try {
    const res = await run.fetch(`${run.base}${REWAKE_PATH}`, { headers, body: run.input });
    if (res.status >= 500) return 'down';
    if (res.status !== 200) return null;
    const { reply } = (await res.json()) as Partial<RewakeReply>;
    return typeof reply === 'string' ? reply : null;
  } catch {
    return 'down';
  }
}

/** Node's global `fetch` gives up on a response header after 5 minutes, and a hold lasts an hour. */
function httpFetch(
  url: string,
  init: { headers: Record<string, string>; body: string },
): Promise<RewakeResponse> {
  return new Promise((resolve, reject) => {
    const send = url.startsWith('https:') ? secureRequest : request;
    const req = send(url, { method: 'POST', headers: init.headers }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (raw += chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, json: async () => JSON.parse(raw) }),
      );
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(init.body);
  });
}

async function main(): Promise<void> {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { code, stderr } = await runRewake({
    input,
    target: process.env[TARGET_ENV],
    base: process.argv[2] ?? '',
    fetch: httpFetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
  });
  if (stderr) process.stderr.write(stderr);
  process.exit(code);
}

if (import.meta.main) await main();
