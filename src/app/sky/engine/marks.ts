import type { SessionState } from '@contract/session';
import type { System } from '@contract/sky';
import type { Placed } from '@app/session/place';

/** A Session state that draws a glyph. Ended draws none: the Gate takes over. */
export type MarkState = Exclude<SessionState, 'ended'>;

/** A Flagged body's four-point sparkle, as multiples of the disc it replaces. */
export const SPARKLE = { point: 2.2, waist: 0.6 } as const;
/** The echo outline's disc, as a multiple of the System's radius. */
export const ECHO = 1.05;

export type Shine = 'flagged' | 'echo' | null;

export function markOf(inFlight: boolean, placed: Placed | undefined): MarkState | null {
  if (!inFlight || !placed) return null;
  if (placed.sharedFrom !== null) return null;
  const { state } = placed.session;
  return state === 'ended' ? null : state;
}

export function systemShine(system: Pick<System, 'closed' | 'flagged' | 'flaggedTickets'>): Shine {
  if (system.closed) return null;
  return system.flagged ? 'flagged' : system.flaggedTickets > 0 ? 'echo' : null;
}

/** Marks clear the sparkle's points. `core` is the disc a sparkle replaces, never `r` twice. */
export function markRadius(r: number, core: number, shine: Shine): number {
  if (shine === 'flagged') return Math.max(r, core * SPARKLE.point);
  if (shine === 'echo') return r * ECHO * SPARKLE.point;
  return r;
}
