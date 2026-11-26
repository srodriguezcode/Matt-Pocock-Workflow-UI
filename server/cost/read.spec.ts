import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { TrackerKind } from '@contract/repo';
import type { Sky } from '@contract/sky';
import { withDefaults } from '#server/config/store.ts';
import type { Deps } from '#server/http/types.ts';
import { sky, ticket } from '#server/launch/fixtures.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { FakeTracker } from '#server/testing/fake-tracker.ts';
import { readCost, transcriptRoot } from './read.ts';
import { linked } from '#server/testing/fake-link.ts';

const HOME = '/home/me';
const ROOT = transcriptRoot(HOME);
const repo = withDefaults({
  path: '/code/uaw',
  owner: 'srodriguezcode',
  name: 'UI-Agent-Workflow',
});
const fixtures = fileURLToPath(new URL('./fixtures/transcripts/ticket-42', import.meta.url));

function ticket42(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(fixtures, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files[join(ROOT, '-code-uaw-worktrees-feature-42', relative(fixtures, path))] = readFileSync(
      path,
      'utf8',
    );
  }
  return files;
}

function session(
  id: string,
  cwd: string,
  model = 'claude-opus-5-5',
  usage: Record<string, unknown> = {
    input_tokens: 1000,
    output_tokens: 1000,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  },
): Record<string, string> {
  const lines = [
    {
      type: 'user',
      isSidechain: false,
      turnOrigin: 'human',
      message: { role: 'user', content: 'Go.' },
      timestamp: '2026-09-28T09:00:00.000Z',
      cwd,
      sessionId: id,
    },
    {
      type: 'assistant',
      isSidechain: false,
      message: {
        id: `msg_${id}`,
        model,
        role: 'assistant',
        usage,
      },
      timestamp: '2026-09-28T09:10:00.000Z',
      cwd,
      sessionId: id,
    },
  ];
  const dir = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  return { [join(ROOT, dir, `${id}.jsonl`)]: lines.map((l) => JSON.stringify(l)).join('\n') };
}

function deps(fs: FakeFs): Deps {
  return { runner: new FakeRunner(), fs, home: HOME, now: () => new Date(), ...linked() };
}

function costOf(
  files: Record<string, string> | FakeFs,
  id: string,
  tracker: TrackerKind = 'github',
) {
  const board: Sky = sky({ tracker, tickets: [ticket(id)] });
  const fake = new FakeTracker({ tracker, viewer: null, issues: [] });
  const fs = files instanceof FakeFs ? files : new FakeFs(files);
  return readCost(deps(fs), repo, fake, board, id);
}

describe('the Cost of a Build ticket', () => {
  it('sums every Session in its worktree, each API message once', async () => {
    const reading = await costOf(ticket42(), '42');
    expect(reading.id).toBe('42');
    expect(reading.sessions).toBe(2);
    expect(reading.tokens).toEqual({
      input: 25,
      output: 245,
      cacheCreation: 1600,
      cacheRead: 18600,
    });
  });

  it('counts subagent sidechains, from their own files and inline', async () => {
    const files = ticket42();
    const withoutSidechains = Object.fromEntries(
      Object.entries(files)
        .filter(([path]) => !path.includes('/subagents/'))
        .map(([path, text]) => [
          path,
          text
            .split('\n')
            .filter((line) => !line.includes('"isSidechain":true'))
            .join('\n'),
        ]),
    );
    const all = await costOf(files, '42');
    const main = await costOf(withoutSidechains, '42');
    expect(all.tokens.output - main.tokens.output).toBe(30 + 40);
    expect(all.workingMs).toBe(main.workingMs);
  });

  it('prices each model from the table and marks the dollars partial for one it lacks', async () => {
    const reading = await costOf(ticket42(), '42');
    const opus = 17 * 4 + 210 * 20 + 1080 * 8 + 220 * 5 + 18200 * 0.2;
    const haiku = 3 * 1 + 30 * 5 + 300 * 1.25 + 400 * 0.1;
    expect(reading.dollars).toBeCloseTo((opus + haiku) / 1_000_000, 9);
    expect(reading.partial).toEqual([{ code: 'no-price', models: ['claude-opus-9'] }]);
  });

  it('prices a cache write at its own TTL, 1.25 times input for 5 minutes and 2 for an hour', async () => {
    const usage = (split?: object) => ({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 0,
      ...(split && { cache_creation: split }),
    });
    const cwd = '/code/uaw.worktrees/feature/42';
    const mixed = await costOf(
      session(
        'mixed',
        cwd,
        'claude-opus-5-5',
        usage({
          ephemeral_5m_input_tokens: 400,
          ephemeral_1h_input_tokens: 600,
        }),
      ),
      '42',
    );
    expect(mixed.dollars).toBeCloseTo((400 * 5 + 600 * 8) / 1_000_000, 9);
    const unsplit = await costOf(session('unsplit', cwd, 'claude-opus-5-5', usage()), '42');
    expect(unsplit.dollars).toBeCloseTo((1000 * 5) / 1_000_000, 9);
    expect(mixed.tokens.cacheCreation).toBe(1000);
  });

  it('sums turn lengths from each human prompt to its last reply, not the wait between', async () => {
    const reading = await costOf(ticket42(), '42');
    const firstSession = 60_000 + 30_000;
    const retried = 30_000;
    expect(reading.workingMs).toBe(firstSession + retried);
  });

  it('leaves out transcripts outside its worktree', async () => {
    const reading = await costOf(
      {
        ...session('main', '/code/uaw'),
        ...session('other', '/code/uaw.worktrees/feature/7'),
        ...session('deeper', '/code/uaw.worktrees/feature/42/src'),
        ...session('lookalike', '/code/uaw-worktrees/feature/42'),
        ...session('elsewhere', '/code/other'),
        ...session('mine', '/code/uaw.worktrees/bugfix/42'),
      },
      '42',
    );
    expect(reading.sessions).toBe(1);
    expect(reading.tokens.input).toBe(1000);
    expect(reading.workingMs).toBe(600_000);
  });

  it('reads none when no Session was opened for it', async () => {
    const reading = await costOf(session('other', '/code/uaw.worktrees/feature/7'), '42');
    expect(reading).toEqual({
      id: '42',
      sessions: 0,
      tokens: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
      dollars: 0,
      workingMs: 0,
      partial: [],
    });
  });

  it('maps a scratch worktree back to its Ticket', async () => {
    const files = {
      ...session('t', '/code/uaw.worktrees/feature/export-03'),
      ...session('s', '/code/uaw.worktrees/feature/export'),
    };
    const reading = await costOf(files, 'export/03', 'scratch');
    expect(reading.sessions).toBe(1);
    expect(reading.dollars).toBeCloseTo((1000 * 4 + 1000 * 20) / 1_000_000, 9);
  });

  it('skips a transcript file or folder it cannot read and counts the rest', async () => {
    const cwd = '/code/uaw.worktrees/feature/42';
    const fs = new FakeFs({
      ...session('fine', cwd),
      ...session('locked', cwd),
      ...session('elsewhere', '/code/uaw.worktrees/bugfix/42'),
    });
    fs.denied.add(join(ROOT, '-code-uaw-worktrees-feature-42', 'locked.jsonl'));
    fs.denied.add(join(ROOT, '-code-uaw-worktrees-bugfix-42'));
    const reading = await costOf(fs, '42');
    expect(reading.sessions).toBe(1);
    expect(reading.tokens.input).toBe(1000);
  });

  it('counts a message a forked Session copied once, and not its turn again', async () => {
    const cwd = '/code/uaw.worktrees/feature/42';
    const original = Object.values(session('aaaa', cwd)).join('');
    const ownTurn = Object.values(session('bbbb', cwd)).join('');
    const dir = join(ROOT, '-code-uaw-worktrees-feature-42');
    const reading = await costOf(
      {
        [join(dir, 'aaaa.jsonl')]: original,
        [join(dir, 'bbbb.jsonl')]: `${original}\n${ownTurn}`,
      },
      '42',
    );
    expect(reading.sessions).toBe(2);
    expect(reading.tokens.input).toBe(2000);
    expect(reading.workingMs).toBe(2 * 600_000);
  });
});
