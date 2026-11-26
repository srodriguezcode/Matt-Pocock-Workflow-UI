/** Adapted from rengwu/wayfinder-maps `layout.js` and `draw.js` (MIT). See NOTICE. */
import type { Camera, Point, Size, ZoomLevel } from './types';

const MIN_SCALE = 0.08;
const MAX_SCALE = 4;
const FIT_MAX_SCALE = 3.2;
/** Screen px kept clear above and below a fit for the controls. */
export const TOP_INSET = 64;
const BOTTOM_INSET = 40;
/** Share of the remaining distance to the goal covered per 60 Hz frame. */
const EASE = 0.25;
export const STAR_SCALE = 2.4;
export const SYSTEM_FROM = 0.45;
export const STAR_FROM = 1.15;
/** Ratio over the sky-fit scale the wheel may reach and still read as sky. */
const FIT_SLACK = 1.05;

export function levelAt(s: number, skyFit: number): ZoomLevel {
  if (s <= skyFit * FIT_SLACK || s < SYSTEM_FROM) return 'sky';
  return s < STAR_FROM ? 'system' : 'star';
}

/** The camera that frames `points` with `pad` world px around them. */
export function fitCamera(points: Point[], viewport: Size, pad: number): Camera {
  if (!points.length) return { x: viewport.w / 2, y: viewport.h / 2, s: 1 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs) - pad;
  const x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad;
  const y1 = Math.max(...ys) + pad;
  const h = Math.max(1, viewport.h - TOP_INSET - BOTTOM_INSET);
  const s = Math.max(MIN_SCALE, Math.min(viewport.w / (x1 - x0), h / (y1 - y0), FIT_MAX_SCALE));
  return {
    s,
    x: viewport.w / 2 - ((x0 + x1) / 2) * s,
    y: TOP_INSET + h / 2 - ((y0 + y1) / 2) * s,
  };
}

export function centreOn(point: Point, viewport: Size, s: number): Camera {
  return { s, x: viewport.w / 2 - point.x * s, y: viewport.h / 2 - point.y * s };
}

export function zoomAround(camera: Camera, screen: Point, factor: number): Camera {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, camera.s * factor));
  const wx = (screen.x - camera.x) / camera.s;
  const wy = (screen.y - camera.y) / camera.s;
  return { s, x: screen.x - wx * s, y: screen.y - wy * s };
}

/** One step of `camera` toward `goal` after `dt` seconds, the same at any frame rate. */
export function ease(camera: Camera, goal: Camera, dt: number): Camera {
  const k = 1 - Math.pow(1 - EASE, dt * 60);
  return {
    x: camera.x + (goal.x - camera.x) * k,
    y: camera.y + (goal.y - camera.y) * k,
    s: camera.s + (goal.s - camera.s) * k,
  };
}
