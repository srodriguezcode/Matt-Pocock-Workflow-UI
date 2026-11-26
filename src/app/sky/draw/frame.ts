import type { Palette } from './palette';

/** One frame's drawing state: the context already transformed to world space, the zoom, the clock. */
export interface Frame {
  ctx: CanvasRenderingContext2D;
  palette: Palette;
  /** Camera scale. */
  s: number;
  /** Seconds. */
  t: number;
}

export const TAU = Math.PI * 2;

/** World-px multiplier that keeps lines at least ~0.6 screen px when zoomed out. */
export function lineScale(s: number): number {
  return Math.max(1 / s, 0.6);
}

/** Stars shrink slower than the sky, so they keep a floor size on screen when zoomed out. */
export function starScale(s: number): number {
  return Math.max(0.7, Math.pow(1 / s, 0.65)) * 0.9;
}

export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

export function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  stops: [number, string][],
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  ctx.fillStyle = g;
  disc(ctx, x, y, r);
  ctx.fill();
}

/** A stable small number per id, so each star and line animates out of step with its neighbours. */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h % 997;
}

export function clock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  face: string,
  hands: string,
): void {
  ctx.fillStyle = face;
  disc(ctx, x, y, r);
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = hands;
  ctx.lineWidth = Math.max(1, r * 0.25);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - r * 0.6);
  ctx.moveTo(x, y);
  ctx.lineTo(x + r * 0.45, y + r * 0.1);
  ctx.stroke();
  ctx.restore();
}
