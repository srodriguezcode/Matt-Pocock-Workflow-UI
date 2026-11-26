import { describe, expect, it } from 'vitest';
import {
  HOLD_MARGIN_S,
  HOLD_TIMEOUT_S,
  HOOK_STARTED_HEADER,
  REWAKE_PATH,
  TARGET_HEADER,
} from './constants.ts';
import { runRewake, type RewakeFetch, type RewakeResponse } from './rewake-hook.ts';

const reply = (status: number, body: unknown): RewakeResponse => ({
  status,
  json: async () => body,
});

function harness(script: (call: number) => RewakeResponse | Error) {
  let clock = 0;
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fetch: RewakeFetch = async (url, init) => {
    calls.push({ url, ...init });
    const result = script(calls.length);
    if (result instanceof Error) throw result;
    return result;
  };
  const run = (target: string | undefined | null = 'repo=%2Fr&kind=ticket&id=1') =>
    runRewake({
      input: '{"hook_event_name":"Stop"}',
      target: target ?? undefined,
      base: 'http://board',
      fetch,
      sleep: async (ms) => void (clock += ms),
      now: () => clock,
    });
  return { calls, run, elapsed: () => clock };
}

describe('runRewake', () => {
  it('exits 2 with the reply on stderr', async () => {
    const { calls, run } = harness(() => reply(200, { reply: 'framed text' }));
    expect(await run()).toEqual({ code: 2, stderr: 'framed text' });
    expect(calls[0]).toMatchObject({
      url: `http://board${REWAKE_PATH}`,
      body: '{"hook_event_name":"Stop"}',
    });
    expect(calls[0]?.headers[TARGET_HEADER]).toBe('repo=%2Fr&kind=ticket&id=1');
  });

  it('exits 0 when nobody replied', async () => {
    const { run } = harness(() => reply(200, { reply: null }));
    expect(await run()).toEqual({ code: 0, stderr: '' });
  });

  it('omits the target header when unset', async () => {
    const { calls, run } = harness(() => reply(200, { reply: null }));
    await run(null);
    expect(calls[0]?.headers).not.toHaveProperty(TARGET_HEADER);
  });

  it('retries with the same Stop and its first start time once the board is back', async () => {
    const { calls, run } = harness((n) =>
      n === 1
        ? new Error('ECONNREFUSED')
        : n === 2
          ? reply(502, {})
          : reply(200, { reply: 'later' }),
    );
    expect(await run()).toEqual({ code: 2, stderr: 'later' });
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((c) => c.body)).size).toBe(1);
    expect(calls.map((c) => c.headers[HOOK_STARTED_HEADER])).toEqual(['0', '0', '0']);
  });

  it('gives up once the hold window has passed', async () => {
    const { calls, run, elapsed } = harness(() => new Error('down'));
    expect(await run()).toEqual({ code: 0, stderr: '' });
    const window = (HOLD_TIMEOUT_S - HOLD_MARGIN_S) * 1000;
    expect(elapsed()).toBeLessThan(window);
    expect(elapsed()).toBeGreaterThan(window - 30_000);
    expect(calls.length).toBeGreaterThan(5);
  });
});
