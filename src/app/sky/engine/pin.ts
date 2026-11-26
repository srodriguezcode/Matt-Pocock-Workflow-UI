import type { Sky } from '@contract/sky';
import { positionAt } from './geometry';
import { DISC_GAP } from './layout';
import type { Disc, Layout, PlacedStar, Point } from './types';

export const TWEEN_S = 0.9;
export const PULSE_S = 1.8;

export interface Pinned {
  layout: Layout;
  /** New or structurally moved stars, each with the world point its tween starts from. */
  moved: Map<string, Point>;
}

export interface Tween {
  from: Point;
  /** Seconds, on the engine clock. */
  t0: number;
}

/**
 * Keeps every star where `prev` had it unless its home changed:
 * another System, the Loose orbit, or a new role.
 */
export function pinLayout(prev: Layout | null, next: Layout, t = 0): Pinned {
  if (!prev) return { layout: next, moved: new Map() };
  const oldDiscs = new Map(prev.discs.map((d) => [d.systemId, d]));
  const shift = new Map<string, Point>();
  /** A surviving disc never shrinks, so no pinned star ends up outside it. */
  const discs = next.discs.map((d) => {
    const old = oldDiscs.get(d.systemId);
    if (!old) return { ...d };
    shift.set(d.systemId, { x: old.x - d.x, y: old.y - d.y });
    return { ...d, x: old.x, y: old.y, r: Math.max(old.r, d.r) };
  });
  for (const [systemId, d] of clearNew(discs, oldDiscs)) shift.set(systemId, d);

  const stars = new Map<string, PlacedStar>();
  const moved = new Map<string, Point>();
  for (const [id, star] of next.stars) {
    const disc = star.orbit ? null : discOf(star, next.discs);
    const was = prev.stars.get(id);
    if (was && homeOf(was, prev.discs) === homeOf(star, next.discs)) {
      stars.set(id, { ...star, x: was.x, y: was.y, orbit: was.orbit });
      continue;
    }
    const d = disc ? shift.get(disc) : undefined;
    const placed = d ? { ...star, x: star.x + d.x, y: star.y + d.y } : star;
    stars.set(id, placed);
    const entry = discs.find((x) => x.systemId === disc) ?? placed;
    moved.set(id, was ? positionAt(was, t) : { x: entry.x, y: entry.y });
  }

  const rim = next.discs.find((d) => d.fogR !== null);
  const fogShift = rim ? shift.get(rim.systemId) : undefined;
  const fog = fogShift
    ? next.fog.map((f) => ({ ...f, x: f.x + fogShift.x, y: f.y + fogShift.y }))
    : next.fog;
  const looseRing = next.looseRing === null ? null : (prev.looseRing ?? next.looseRing);
  return { layout: { stars, discs, fog, looseRing }, moved };
}

/** World px a new disc steps outward per try. */
const CLEAR_STEP = 10;

/** Walks each new disc out from the origin until it clears every disc placed before it. */
function clearNew(discs: Disc[], pinned: Map<string, Disc>): Map<string, Point> {
  const settled = discs.filter((d) => pinned.has(d.systemId));
  const shifts = new Map<string, Point>();
  for (const d of discs) {
    if (pinned.has(d.systemId)) continue;
    const len = Math.hypot(d.x, d.y);
    const ux = len ? d.x / len : 1;
    const uy = len ? d.y / len : 0;
    const start = { x: d.x, y: d.y };
    while (settled.some((o) => Math.hypot(o.x - d.x, o.y - d.y) < o.r + d.r + DISC_GAP)) {
      d.x += ux * CLEAR_STEP;
      d.y += uy * CLEAR_STEP;
    }
    settled.push(d);
    shifts.set(d.systemId, { x: d.x - start.x, y: d.y - start.y });
  }
  return shifts;
}

function homeOf(star: PlacedStar, discs: Disc[]): string {
  if (star.role === 'ember') return 'ember';
  if (star.orbit) return 'loose';
  return `${star.role} ${discOf(star, discs)}`;
}

/** The disc the star sits deepest inside, so an overlapping neighbour never claims it. */
function discOf(star: PlacedStar, discs: Disc[]): string | null {
  let best: string | null = null;
  let depth = Infinity;
  for (const d of discs) {
    const k = Math.hypot(star.x - d.x, star.y - d.y) / d.r;
    if (k <= 1 && k < depth) {
      depth = k;
      best = d.systemId;
    }
  }
  return best;
}

export function gateChanges(prev: Sky | null, next: Sky): Set<string> {
  if (!prev) return new Set();
  const old = looks(prev);
  const changed = new Set<string>();
  for (const [id, look] of looks(next)) {
    const was = old.get(id);
    if (was !== undefined && was !== look) changed.add(id);
  }
  return changed;
}

function looks(sky: Sky): Map<string, string> {
  return new Map([
    ...sky.tickets.map((t) => [t.id, t.light] as const),
    ...sky.systems.map((s) => [s.id, `${s.state} ${s.gated} ${s.closed}`] as const),
    ...sky.embers.map((e) => [e.id, e.gate] as const),
  ]);
}

export function tweenedAt(star: PlacedStar, tween: Tween | undefined, t: number): Point {
  const to = positionAt(star, t);
  if (!tween) return to;
  const k = Math.min(1, Math.max(0, (t - tween.t0) / TWEEN_S));
  const e = 1 - Math.pow(1 - k, 3);
  return {
    x: tween.from.x + (to.x - tween.from.x) * e,
    y: tween.from.y + (to.y - tween.from.y) * e,
  };
}
