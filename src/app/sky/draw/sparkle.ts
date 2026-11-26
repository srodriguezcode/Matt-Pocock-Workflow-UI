import { ECHO, SPARKLE } from '@app/sky/engine/marks';
import type { Point } from '@app/sky/engine/types';
import { disc, type Frame, glow, TAU } from './frame';
import { rgba, type Rgb } from './palette';

/** Multiples of the disc radius. */
const GLOW = 7;
const CENTRE = 0.45;

/** Takes the disc's radius, not the points'. The points reach `SPARKLE.point` times it. */
export function traceBody(f: Frame, p: Point, r: number, flagged: boolean): void {
  if (flagged) traceSparkle(f.ctx, p, r);
  else disc(f.ctx, p.x, p.y, r);
}

/** Call before tracing the body: drawn after, the glow covers it. */
export function drawSparkleGlow(f: Frame, p: Point, r: number, core: Rgb, dim: number): void {
  if (!f.palette.glows) return;
  glow(f.ctx, p.x, p.y, r * GLOW, [
    [0, rgba(f.palette.ink, 0.63 * dim)],
    [0.25, rgba(core, 0.32 * dim)],
    [1, rgba(core, 0)],
  ]);
}

/** Filled sparkles only. White is the ink on the dark theme and the paper on the light one. */
export function drawSparkleCentre(f: Frame, p: Point, r: number, dim: number): void {
  const { ctx, palette } = f;
  ctx.fillStyle = rgba(palette.glows ? palette.ink : palette.sky, 0.9 * dim);
  disc(ctx, p.x, p.y, r * CENTRE);
  ctx.fill();
}

/** `r` is the System's radius, not its 0.8 core. */
export function traceEcho(f: Frame, p: Point, r: number): void {
  traceSparkle(f.ctx, p, r * ECHO);
}

function traceSparkle(ctx: CanvasRenderingContext2D, p: Point, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8 - Math.PI / 2;
    const rr = r * (i % 2 === 0 ? SPARKLE.point : SPARKLE.waist);
    ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
  }
  ctx.closePath();
}
