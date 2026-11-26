import { describe, expect, it } from 'vitest';
import type { SessionState, SessionView } from '@contract/session';
import type { Claim } from '@contract/sky';
import type { Placed } from './place';
import { staleClaim } from './stale-claim';

const claim = (heldWeek: boolean): Claim => ({
  holder: 'ana',
  since: '2026-09-20',
  ageDays: heldWeek ? 9 : 2,
  heldWeek,
  mine: false,
});

const placed = (state: SessionState, sharedFrom: string | null = null): Placed => ({
  session: { state } as SessionView,
  sharedFrom,
});

describe('staleClaim', () => {
  it('reads a Claim held a week or more as Stale with no Session', () => {
    expect([staleClaim(claim(true), null), staleClaim(claim(false), null)]).toEqual([true, false]);
  });

  it('holds for a Session Working, Asking or Waiting', () => {
    const live: SessionState[] = ['working', 'asking', 'waiting'];
    expect(live.map((s) => staleClaim(claim(true), placed(s)))).toEqual([false, false, false]);
  });

  it('does not hold for a Lost or Ended Session', () => {
    expect([placed('lost'), placed('ended')].map((p) => staleClaim(claim(true), p))).toEqual([
      true,
      true,
    ]);
  });

  it("counts a System's Session its ticket shares", () => {
    expect(staleClaim(claim(true), placed('waiting', '10'))).toBe(false);
  });

  it('is never Stale without a Claim', () => {
    expect(staleClaim(null, null)).toBe(false);
  });
});
