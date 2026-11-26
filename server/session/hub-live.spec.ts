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
