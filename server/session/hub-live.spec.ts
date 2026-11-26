import { afterEach, describe, expect, it } from 'vitest';
import { testHub } from '#server/testing/fake-link.ts';
import type { HookEvent } from './hook-event.ts';
import { encodeTarget, type LinkTarget } from './target.ts';

const REPO = '/code/app';
const signal = new AbortController().signal;
const linked = (id: string): LinkTarget => ({ repo: REPO, target: { kind: 'ticket', id } });
const prompt = (id: string): HookEvent => ({
  session_id: id,
  cwd: `${REPO}.worktrees/feature/${id}`,
  hook_event_name: 'UserPromptSubmit',
  prompt: 'go',
});
const end = (id: string): HookEvent => ({ ...prompt(id), hook_event_name: 'SessionEnd' });

const hub = testHub();
afterEach(() => hub.stop());

describe('liveTargets', () => {
  it('counts Working and leaves out Ended', async () => {
    await hub.hook(encodeTarget(linked('1')), prompt('1'), signal);
    await hub.hook(encodeTarget(linked('2')), prompt('2'), signal);
    await hub.hook(encodeTarget(linked('2')), end('2'), signal);
    expect(hub.liveTargets()).toEqual([{ repo: REPO, target: { kind: 'ticket', id: '1' } }]);
  });
});

describe('a new session', () => {
  const fresh = testHub();
  afterEach(() => fresh.stop());
  const session = (key: string): LinkTarget => ({
    repo: REPO,
    target: { kind: 'session', key, title: `idea ${key}` },
  });

  it('links by its key, keeps two side by side, and holds no star', async () => {
    await fresh.hook(encodeTarget(session('k1')), { ...prompt('a'), cwd: REPO }, signal);
    await fresh.hook(encodeTarget(session('k2')), { ...prompt('b'), cwd: REPO }, signal);
    expect(fresh.snapshot().map((s) => [s.sessionId, s.target])).toEqual([
      ['a', { kind: 'session', key: 'k1', title: 'idea k1' }],
      ['b', { kind: 'session', key: 'k2', title: 'idea k2' }],
    ]);
    expect(fresh.liveTargets()).toEqual([]);
  });
});
