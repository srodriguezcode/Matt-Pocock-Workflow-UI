export const POLL_MS = 300_000;
export const BACKOFF_MS = 900_000;

/** `tick` is the poll timer, `visible` the tab coming back into view. */
export type Trigger = 'tick' | 'visible' | 'focus' | 'manual';

export interface ClockState {
  /** Epoch ms the last read ended, success or failure. */
  settledAt: number;
  failed: boolean;
  reading: boolean;
  visible: boolean;
}

export interface ClockPlan {
  read: boolean;
  gaps: boolean;
}

export function nextPollAt(state: Pick<ClockState, 'settledAt' | 'failed'>): number {
  return state.settledAt + (state.failed ? BACKOFF_MS : POLL_MS);
}

export function planFor(trigger: Trigger, state: ClockState, now: number): ClockPlan {
  if (state.reading) return { read: false, gaps: false };
  switch (trigger) {
    case 'manual':
      return { read: true, gaps: true };
    case 'focus':
      return { read: true, gaps: false };
    case 'tick':
    case 'visible':
      return { read: state.visible && now >= nextPollAt(state), gaps: false };
  }
}
