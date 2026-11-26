import type { RoutedSky } from './route';
import type { Shown } from './visibility';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Screen = world × `s` + (`x`, `y`). */
export interface Camera {
  x: number;
  y: number;
  s: number;
}

export type ZoomLevel = 'sky' | 'system' | 'star';

export type Selection =
  { kind: 'star'; id: string } | { kind: 'line'; id: string } | { kind: 'fog'; id: string } | null;

export type StarRole = 'system' | 'ticket' | 'ember' | 'closed';

/** A Loose ticket circling the origin: angle `a` at t = 0, `w` radians per second. */
export interface Orbit {
  r: number;
  a: number;
  w: number;
}

export interface PlacedStar {
  id: string;
  role: StarRole;
  x: number;
  y: number;
  orbit: Orbit | null;
}

export interface Disc {
  systemId: string;
  x: number;
  y: number;
  r: number;
  /** Radius Fog sits on. The Map's disc only. */
  fogR: number | null;
}

export interface PlacedFog {
  id: string;
  x: number;
  y: number;
}

/** World positions for one Sky. Depends on structure only, never on gates. */
export interface Layout {
  stars: Map<string, PlacedStar>;
  discs: Disc[];
  fog: PlacedFog[];
  /** Radius of the Loose ticket orbit, or `null` with no Loose tickets. */
  looseRing: number | null;
}

/** `t` is seconds. */
export interface Scene {
  sky: RoutedSky;
  layout: Layout;
  camera: Camera;
  viewport: Size;
  shown: Shown;
  t: number;
  /** Set by zooming, not read off `camera.s`: a small Sky fits at a scale deeper levels use. */
  level: ZoomLevel;
  /** World point a star is drawn at now, mid-tween included. `null` for an unknown id. */
  where: (id: string) => Point | null;
}

export const LOOSE = 'loose';
