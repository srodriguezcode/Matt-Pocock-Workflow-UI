import type { MarkState } from '@app/sky/engine/marks';
import type { Point } from '@app/sky/engine/types';
import { disc, type Frame, seedOf, starScale } from './frame';
import { rgba, type Rgb } from './palette';

const PERIOD_S = 2.4;
const ASK_PERIOD_S = 1.4;
/** Arcs of the broken ring a Lost Session leaves, in radians. */
const LOST_ARCS = [
  [0.2, 1.3],
  [1.9, 3.1],
  [3.8, 5.6],
] as const;

/**
 * A pulsar around the star. `clear` is a radius outside the In flight ring and the selection halo:
 * the still rings sit there so they never overlap either.
 */
export function drawSessionMark(
  f: Frame,
  p: Point,
  id: string,
  clear: number,
  state: MarkState,
  dim: number,
): void {
  const { ctx, palette, t } = f;
  const k = starScale(f.s);
  const colour = state === 'lost' ? palette.mark.stale : palette.mark[state];
  const ring = (radius: number, alpha: number, width: number) => {
    ctx.strokeStyle = rgba(colour, alpha * dim);
    ctx.lineWidth = width * k;
    disc(ctx, p.x, p.y, radius);
    ctx.stroke();
  };
  const from = clear - 11 * k;
  if (state === 'working') {
    const offset = (seedOf(id) / 997) * PERIOD_S;
    for (const half of [0, PERIOD_S / 2]) {
      const phase = ((t + offset + half) % PERIOD_S) / PERIOD_S;
      ring(from + phase * 16 * k, 0.7 * (1 - phase), 1.4 - phase);
    }
  } else if (state === 'asking') {
    const phase = (t % ASK_PERIOD_S) / ASK_PERIOD_S;
    for (const lag of [0, 0.18]) {
      const s = (phase - lag) / 0.6;
      if (s >= 0 && s <= 1) ring(from + s * 12 * k, 0.95 * (1 - s), 1.6 - s);
    }
  } else if (state === 'waiting') {
    const beat = 0.5 + 0.5 * Math.sin(t);
    ring(clear + 1.5 * beat * k, 0.3 + 0.4 * beat, 1.2);
  } else {
    lostRing(ctx, p, clear, colour, dim, k);
  }
}

function lostRing(
  ctx: CanvasRenderingContext2D,
  p: Point,
  radius: number,
  colour: Rgb,
  dim: number,
  k: number,
): void {
  ctx.strokeStyle = rgba(colour, 0.7 * dim);
  ctx.lineWidth = 1.2 * k;
  for (const [start, end] of LOST_ARCS) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, start, end);
    ctx.stroke();
  }
}
