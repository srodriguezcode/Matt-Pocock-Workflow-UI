import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEvent } from '@contract/session';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { testHub } from '#server/testing/fake-link.ts';
import type { AgentEntry } from './agents.ts';
import { AGENTS_POLL_MS } from './constants.ts';
import type { HookEvent, StopEvent } from './hook-event.ts';
import type { SessionHub } from './hub.ts';
import { fileLaunchStore, launchesPath } from './launch-store.ts';
import { encodeTarget, type LinkTarget } from './target.ts';

const REPO = '/code/app';
const WORKTREE = '/code/app.worktrees/feature/42';
const T0 = new Date('2026-09-30T10:00:00Z');
const ticket42: LinkTarget = { repo: REPO, target: { kind: 'ticket', id: '42' } };
const HEADER = encodeTarget(ticket42);
const signal = new AbortController().signal;

const prompt = (id: string, cwd = WORKTREE): HookEvent => ({
  session_id: id,
  cwd,
  hook_event_name: 'UserPromptSubmit',
  prompt: '/implement-ticket #42',
});
const bash = (id: string): HookEvent => ({
  session_id: id,
  cwd: WORKTREE,
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'npm test' },
});
const stop = (id: string): StopEvent => ({
  session_id: id,
  cwd: WORKTREE,
  hook_event_name: 'Stop',
  last_assistant_message: 'Done.',
});
const permission = (id: string): HookEvent => ({
  session_id: id,
  cwd: WORKTREE,
  hook_event_name: 'Notification',
  notification_type: 'permission_prompt',
});
const sessionEnd = (id: string): HookEvent => ({
  session_id: id,
  cwd: WORKTREE,
  hook_event_name: 'SessionEnd',
});

let agents: AgentEntry[];
let reads: number;
let hub: SessionHub;

const entry = (sessionId: string, busy = true, cwd = WORKTREE): AgentEntry => ({
  sessionId,
  pid: 100,
  cwd,
  busy,
});

function makeHub(identifyByCwd: (cwd: string) => Promise<LinkTarget | null> = async () => null) {
  hub = testHub({
    now: () => new Date(),
    readAgents: async () => {
      reads += 1;
      return agents;
    },
    identifyByCwd,
  });
  return hub;
}

const state = (id: string) => hub.snapshot().find((s) => s.sessionId === id);
const poll = () => vi.advanceTimersByTimeAsync(AGENTS_POLL_MS);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  agents = [];
  reads = 0;
  makeHub();
});

afterEach(() => {
  hub.stop();
  vi.useRealTimers();
});

describe('linking', () => {
  it('links a Session by its target header', async () => {
    expect(await hub.hook(HEADER, prompt('s1', '/anywhere'), signal)).toEqual({});
    expect(state('s1')).toMatchObject({ repo: REPO, target: ticket42.target, state: 'working' });
  });

  it("falls back to a Start's worktree when the header is missing", async () => {
    hub.launched({ ...ticket42, cwd: WORKTREE, terminal: null });
    await hub.hook(undefined, prompt('s1'), signal);
    expect(state('s1')?.target).toEqual(ticket42.target);
  });

  it('ignores a hand-started session', async () => {
    hub.launched({ repo: REPO, target: { kind: 'map', id: '7' }, cwd: REPO, terminal: null });
    expect(await hub.hook(undefined, prompt('s1', REPO), signal)).toEqual({});
    expect(await hub.hook(undefined, prompt('s2', '/elsewhere'), signal)).toEqual({});
    expect(hub.snapshot()).toEqual([]);
  });
});

describe('state from hook events', () => {
  it('follows Working, Waiting on a turn end and Waiting on a permission prompt', async () => {
    await hub.hook(HEADER, prompt('s1'), signal);
    vi.setSystemTime(new Date('2026-09-30T10:01:00Z'));
    await hub.hook(HEADER, permission('s1'), signal);
    expect(state('s1')).toMatchObject({
      state: 'waiting',
      waiting: 'permission-prompt',
      since: '2026-09-30T10:01:00.000Z',
    });
    await hub.hook(HEADER, bash('s1'), signal);
    expect(state('s1')).toMatchObject({ state: 'working', waiting: null });
    await hub.hook(HEADER, stop('s1'), signal);
    expect(state('s1')).toMatchObject({ state: 'waiting', waiting: 'turn-end' });
  });

  it('returns the wire shape from the snapshot', async () => {
    await hub.hook(HEADER, prompt('s1'), signal);
    expect(hub.snapshot()).toEqual([
      {
        sessionId: 's1',
        repo: REPO,
        target: { kind: 'ticket', id: '42' },
        state: 'working',
        waiting: null,
        since: T0.toISOString(),
        startedAt: T0.toISOString(),
        question: null,
        note: null,
        typeable: false,
        peek: [
          {
            at: T0.toISOString(),
            kind: 'prompt',
            tool: null,
            text: expect.any(String),
            full: expect.any(String),
            human: true,
          },
        ],
      },
    ]);
  });

  it('sends a status delta to subscribers on each move', async () => {
    const events: SessionEvent[] = [];
    hub.subscribe((e) => events.push(e));
    await hub.hook(HEADER, prompt('s1'), signal);
    await hub.hook(HEADER, bash('s1'), signal);
    await hub.hook(HEADER, stop('s1'), signal);
    const statuses = events.flatMap((e) => (e.type === 'status' ? [e.session] : []));
    expect(statuses.map((s) => [s.state, s.waiting])).toEqual([
      ['working', null],
      ['waiting', 'turn-end'],
    ]);
  });
});

describe('newest Session per target', () => {
  it('replaces the older one and drops its later events', async () => {
    const events: SessionEvent[] = [];
    hub.subscribe((e) => events.push(e));
    await hub.hook(HEADER, prompt('old'), signal);
    await hub.hook(HEADER, prompt('new'), signal);
    expect(events).toContainEqual({ type: 'drop', sessionId: 'old' });
    await hub.hook(HEADER, stop('old'), signal);
    expect(hub.snapshot().map((s) => [s.sessionId, s.state])).toEqual([['new', 'working']]);
  });
});

describe('polling agents --json', () => {
  it('runs only while a Session is live', async () => {
    await hub.start();
    expect(reads).toBe(1);
    await poll();
    await poll();
    expect(reads).toBe(1);

    agents = [entry('s1')];
    await hub.hook(HEADER, prompt('s1'), signal);
    await poll();
    await poll();
    expect(reads).toBe(3);

    await hub.hook(HEADER, sessionEnd('s1'), signal);
    await poll();
    const afterEnd = reads;
    await poll();
    await poll();
    expect(reads).toBe(afterEnd);
  });

  it('keeps a silent Session Working and marks Lost only once its pid is gone', async () => {
    agents = [entry('s1', false)];
    await hub.hook(HEADER, prompt('s1'), signal);
    for (let i = 0; i < 20; i += 1) await poll();
    expect(state('s1')?.state).toBe('working');

    agents = [];
    await poll();
    expect(state('s1')).toMatchObject({ state: 'lost', waiting: null });
  });

  it('keeps a held turn end Waiting when a poll right after Stop still reads busy', async () => {
    agents = [entry('s1', true)];
    await hub.hook(HEADER, prompt('s1'), signal);
    const held = hub.rewake(HEADER, stop('s1'), signal);
    await poll();
    expect(state('s1')).toMatchObject({ state: 'waiting', waiting: 'turn-end' });
    expect(state('s1')?.question).toMatchObject({ kind: 'reply' });
    await hub.hook(HEADER, prompt('s1'), signal);
    expect(state('s1')?.state).toBe('working');
    expect(await held).toBeNull();
  });

  it('polls again once a hook revives a Lost Session', async () => {
    await hub.hook(HEADER, prompt('s1'), signal);
    await poll();
    expect(state('s1')?.state).toBe('lost');
    const before = reads;
    await poll();
    expect(reads).toBe(before);
    await hub.hook(HEADER, bash('s1'), signal);
    expect(state('s1')?.state).toBe('working');
    await poll();
    expect(reads).toBe(before + 1);
    expect(state('s1')?.state).toBe('lost');
  });

  it('keeps an Ended Session Ended when its pid leaves the listing', async () => {
    agents = [entry('s1')];
    await hub.hook(HEADER, prompt('s1'), signal);
    await hub.hook(HEADER, sessionEnd('s1'), signal);
    agents = [];
    await hub.poll();
    expect(state('s1')?.state).toBe('ended');
  });

  it('keeps Ended and Lost Sessions until a newer Session takes the target', async () => {
    await hub.hook(HEADER, prompt('s1'), signal);
    await poll();
    expect(state('s1')?.state).toBe('lost');
    await poll();
    expect(state('s1')?.state).toBe('lost');
    await hub.hook(HEADER, prompt('s2'), signal);
    expect(hub.snapshot().map((s) => s.sessionId)).toEqual(['s2']);
  });
});

describe('rebuild after a board restart', () => {
  it('links the Sessions agents --json lists in a Start worktree', async () => {
    makeHub(async (cwd) => (cwd === WORKTREE ? ticket42 : null));
    agents = [entry('s1', false), entry('mine', true, '/elsewhere')];
    await hub.start();
    expect(hub.snapshot()).toEqual([
      expect.objectContaining({
        sessionId: 's1',
        target: ticket42.target,
        state: 'waiting',
        waiting: 'turn-end',
      }),
    ]);
    await hub.hook(undefined, bash('s1'), signal);
    expect(state('s1')?.state).toBe('working');
  });

  it('keeps the Session a hook linked while the rebuild was still identifying it', async () => {
    makeHub(async () => {
      await hub.hook(HEADER, bash('s1'), signal);
      return { repo: REPO, target: { kind: 'ticket', id: '9' } };
    });
    agents = [entry('s1', false)];
    await hub.start();
    expect(hub.snapshot()).toEqual([
      expect.objectContaining({ sessionId: 's1', target: ticket42.target, state: 'working' }),
    ]);
  });
});

describe('Session link across a board restart', () => {
  const path = launchesPath('/home/me');
  const tab = 'w0t1p0:TAB';

  function boardOn(fs: FakeFs) {
    return testHub({
      now: () => new Date(),
      readAgents: async () => agents,
      identifyByCwd: async (cwd) => (cwd === WORKTREE ? ticket42 : null),
      launchStore: fileLaunchStore(fs, path),
    });
  }

  it("keeps a Start's tab, so its Session stays typeable", async () => {
    const fs = new FakeFs();
    const before = boardOn(fs);
    before.launched({ ...ticket42, cwd: WORKTREE, terminal: tab });
    await vi.waitFor(() => expect(fs.files.has(path)).toBe(true));
    before.stop();
    agents = [entry('s1', false)];
    hub = boardOn(fs);
    await hub.start();
    expect(state('s1')).toMatchObject({ target: ticket42.target, typeable: true });
  });

  it('matches a headerless hook to a saved Start worktree', async () => {
    const saved = [{ ...ticket42, cwd: WORKTREE, terminal: tab }];
    hub = boardOn(new FakeFs({ [path]: JSON.stringify(saved) }));
    await hub.start();
    await hub.hook(undefined, prompt('s1'), signal);
    expect(state('s1')).toMatchObject({ target: ticket42.target, typeable: true });
  });

  it('keeps the saved records when a Start lands before the load', async () => {
    const older = { repo: REPO, target: { kind: 'ticket', id: '9' }, cwd: '/x', terminal: tab };
    const fs = new FakeFs({ [path]: JSON.stringify([older]) });
    const newer = { ...ticket42, cwd: WORKTREE, terminal: tab };
    boardOn(fs).launched(newer);
    await vi.waitFor(async () => {
      expect(await fileLaunchStore(fs, path).load()).toEqual([older, newer]);
    });
  });

  it('keeps a saved Start on another star from making a Session typeable', async () => {
    const other = { repo: REPO, target: { kind: 'ticket', id: '9' }, cwd: '/x', terminal: tab };
    agents = [entry('s1', false)];
    hub = boardOn(new FakeFs({ [path]: JSON.stringify([other]) }));
    await hub.start();
    expect(state('s1')).toMatchObject({ target: ticket42.target, typeable: false });
  });
});
