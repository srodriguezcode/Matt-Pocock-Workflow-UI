import { describe, expect, it } from 'vitest';
import type { LaunchPlan, StartLabel, StartOption, StartReason } from '@contract/launch';
import { englishMessages } from '@app/i18n/messages.en';
import type { Claim } from '@contract/sky';
import type { SessionState, SessionView } from '@contract/session';
import type { Placed } from '@app/session/place';
import { baseNote, pillFace as face, sheetTitle } from './face';
import { advance, begin } from './progress';

const target = { kind: 'ticket', id: '613' } as const;
const start: StartOption = { enabled: true, target, label: { code: 'ticket' } };
const pillFace = (
  ...args: [StartOption | null, Claim | null, Parameters<typeof face>[2], Placed?]
) => {
  const [option, held, launch, placed] = args;
  return face(
    option,
    held,
    launch,
    englishMessages.board.pill,
    englishMessages.board.codes,
    placed,
  );
};
const claim = (over: Partial<Claim>): Claim => ({
  holder: 'ana-m',
  since: '2026-09-16',
  ageDays: 9,
  heldWeek: true,
  mine: false,
  ...over,
});
const plan = {
  target,
  claims: ['613'],
  steps: [
    { key: 'reread', action: { code: 'reread', handles: ['#613'] }, commands: [] },
    { key: 'claim', action: { code: 'claim', handles: ['#613'] }, commands: [] },
    { key: 'fetch', action: { code: 'fetch' }, commands: [] },
  ],
} as unknown as LaunchPlan;

describe('pillFace', () => {
  it('offers the Start label on each startable target', () => {
    const labels: [StartLabel, string][] = [
      [{ code: 'ticket' }, 'Start'],
      [{ code: 'system', count: 6 }, 'Start all 6'],
      [{ code: 'decision' }, 'Start decision'],
      [{ code: 'map' }, 'Start the map'],
    ];
    for (const [label, text] of labels) {
      expect(pillFace({ ...start, label }, null, null)).toEqual({
        tone: 'go',
        text: `▸ ${text}`,
      });
    }
  });

  it('shows the first failing reason, not clickable', () => {
    const reasons: [StartReason, string][] = [
      [{ code: 'blocked-by', blockers: ['#633'], outside: [] }, 'blocked by #633'],
      [{ code: 'system-gated', blockers: ['#602'] }, 'gated by #602'],
      [{ code: 'ready-for-human' }, "ready-for-human: yours, not an agent's"],
      [{ code: 'gap', problem: { code: 'gh-missing' } }, 'Gap: gh is not installed'],
    ];
    for (const [reason, text] of reasons) {
      const option: StartOption = { enabled: false, target: null, reason };
      expect(pillFace(option, null, null)).toEqual({
        tone: 'off',
        text: `⊘ ${text}`,
      });
    }
  });

  it('is hidden with no option and no claim', () => {
    expect(pillFace(null, null, null)).toBeNull();
  });

  it('shows a claim over the option, with a moon when stale', () => {
    const off: StartOption = {
      enabled: false,
      target,
      reason: { code: 'in-flight', holder: null, mine: false },
    };
    expect(pillFace(off, claim({}), null)).toEqual({
      tone: 'held',
      text: '● @ana-m · 9 d ☾',
    });
    const placed = (state: SessionState): Placed => ({
      session: { state } as SessionView,
      sharedFrom: null,
    });
    expect(pillFace(off, claim({}), null, placed('working'))?.text).toBe('● @ana-m · 9 d');
    expect(pillFace(off, claim({}), null, placed('lost'))?.text).toBe('● @ana-m · 9 d ☾');
    expect(pillFace(off, claim({}), null, placed('ended'))?.text).toBe('● @ana-m · 9 d ☾');
    expect(pillFace(off, claim({}), null, placed('waiting'))?.text).toBe('● @ana-m · 9 d');
    expect(pillFace(off, claim({ mine: true, ageDays: 2, heldWeek: false }), null)?.text).toBe(
      '● yours · 2 d',
    );
    expect(pillFace(null, claim({ holder: null, ageDays: null, heldWeek: false }), null)).toEqual({
      tone: 'mine',
      text: '● yours',
    });
  });

  it('shows a launch over everything', () => {
    let launch = begin('/r', target, { code: 'ticket' }, plan);
    launch = advance(launch, { type: 'step', index: 2, key: 'fetch', status: 'running' });
    expect(pillFace(start, claim({}), launch)).toEqual({
      tone: 'go',
      text: '◐ 3/3 fetch',
    });
    const done = advance(launch, {
      type: 'end',
      ok: true,
      outcome: { code: 'opened', command: '' },
    });
    expect(pillFace(start, null, done)?.text).toBe('✓ started');
    const failed = advance(launch, {
      type: 'end',
      ok: false,
      outcome: { code: 'crashed', error: '' },
    });
    expect(pillFace(start, null, failed)).toEqual({ tone: 'bad', text: '✗ failed' });
  });
});

describe('sheet copy', () => {
  const codes = englishMessages.board.codes;
  const sheet = englishMessages.board.sheet;

  it('titles the sheet with the handle, except the Map', () => {
    expect(sheetTitle('ticket', 'Start', '#613', codes)).toBe('Start · #613');
    expect(sheetTitle('system', 'Start all 6', '#602', codes)).toBe('Start all 6 · #602');
    expect(sheetTitle('map', 'Start the map', '#1', codes)).toBe('Start the map');
  });

  it('names where the Base came from', () => {
    expect(baseNote('system', '#602', sheet, codes)).toBe('Base: in #602');
    expect(baseNote('repo', null, sheet, codes)).toBe('repo config');
    expect(baseNote('default', null, sheet, codes)).toBe('default branch');
  });
});
