import type { Camera, PlacedStar, Point } from './types';

/** Where a star is at time `t`. Only Loose tickets move. */
export function positionAt(star: PlacedStar, t: number): Point {
  if (!star.orbit) return { x: star.x, y: star.y };
  const angle = star.orbit.a + t * star.orbit.w;
  return { x: Math.cos(angle) * star.orbit.r, y: Math.sin(angle) * star.orbit.r };
}

export function toScreen(point: Point, camera: Camera): Point {
  return { x: point.x * camera.s + camera.x, y: point.y * camera.s + camera.y };
}

export function toWorld(point: Point, camera: Camera): Point {
  return { x: (point.x - camera.x) / camera.s, y: (point.y - camera.y) / camera.s };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
