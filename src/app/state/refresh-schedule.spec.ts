import { describe, expect, it } from 'vitest';
import { BACKOFF_MS, type ClockState, planFor, POLL_MS } from './refresh-schedule';

const idle: ClockState = { settledAt: 0, failed: false, reading: false, visible: true };
const nothing = { read: false, gaps: false };

describe('planFor', () => {
  it('polls once 60 s have passed since the last read', () => {
    expect(planFor('tick', idle, POLL_MS - 1)).toEqual(nothing);
    expect(planFor('tick', idle, POLL_MS)).toEqual({ read: true, gaps: false });
  });

  it('never polls while the tab is hidden', () => {
    expect(planFor('tick', { ...idle, visible: false }, POLL_MS * 10)).toEqual(nothing);
  });

  it('reads on coming back into view only when a poll is overdue', () => {
    expect(planFor('visible', idle, POLL_MS / 2)).toEqual(nothing);
    expect(planFor('visible', idle, POLL_MS * 3)).toEqual({ read: true, gaps: false });
  });

  it('backs off to 5 min after a failed read', () => {
    const failed = { ...idle, failed: true };
    expect(planFor('tick', failed, POLL_MS)).toEqual(nothing);
    expect(planFor('tick', failed, BACKOFF_MS)).toEqual({ read: true, gaps: false });
  });

  it('reads on focus at once, backoff or not, without checking Gaps', () => {
    expect(planFor('focus', { ...idle, failed: true }, 1)).toEqual({ read: true, gaps: false });
  });

  it('re-checks Gaps only on the button', () => {
    expect(planFor('manual', idle, 1)).toEqual({ read: true, gaps: true });
  });

  it('starts nothing while a read is in flight', () => {
    const reading = { ...idle, reading: true };
    for (const trigger of ['tick', 'visible', 'focus', 'manual'] as const) {
      expect(planFor(trigger, reading, BACKOFF_MS * 2)).toEqual(nothing);
    }
  });
});
