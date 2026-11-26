/** Adapted from rengwu/wayfinder-maps `draw.js` (MIT). See NOTICE. */
import type { Point } from './types';

export interface Curve {
  a: Point;
  b: Point;
  c: Point;
  len: number;
}

/** Hyperlanes bow wider than Lanes, so a route across Systems clears the discs it passes. */
export function edgeCurve(a: Point, b: Point, hyperlane: boolean): Curve {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(hyperlane ? 90 : 36, len * (hyperlane ? 0.22 : 0.12));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return { a, b, c: { x: mid.x - (dy / len) * bow, y: mid.y + (dx / len) * bow }, len };
}

export function pointOn(curve: Curve, u: number): Point {
  const m = 1 - u;
  const { a, b, c } = curve;
  return {
    x: m * m * a.x + 2 * m * u * c.x + u * u * b.x,
    y: m * m * a.y + 2 * m * u * c.y + u * u * b.y,
  };
}

/** Unit tangent at `u`, pointing blocker → blocked. */
export function tangentOn(curve: Curve, u: number): Point {
  const { a, b, c } = curve;
  const x = 2 * (1 - u) * (c.x - a.x) + 2 * u * (b.x - c.x);
  const y = 2 * (1 - u) * (c.y - a.y) + 2 * u * (b.y - c.y);
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

export function samples(curve: Curve, count: number): Point[] {
  return Array.from({ length: count + 1 }, (_, i) => pointOn(curve, i / count));
}
