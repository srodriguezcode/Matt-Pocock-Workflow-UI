import { edgeCurve, samples } from './curve';
import { distance, toScreen } from './geometry';
import { closedChildren, type RoutedSky } from './route';
import type { Point, Scene, Selection } from './types';

/** Screen px. */
const STAR_REACH = 10;
const LINE_REACH = 7;
const FOG_REACH = 34;
const CURVE_SAMPLES = 24;
/** Screen px. At sky zoom a Lane shorter than this cannot be clicked, so the click lands on its stars. */
export const SHORT_LANE = 60;

export function hitTest(scene: Scene, screen: Point): Selection {
  const { sky, layout, camera, shown } = scene;

  let star: string | null = null;
  let best = STAR_REACH;
  for (const id of layout.stars.keys()) {
    if (!shown.star(id)) continue;
    const at = scene.where(id);
    if (!at) continue;
    const d = distance(toScreen(at, camera), screen);
    if (d < best) {
      best = d;
      star = id;
    }
  }
  if (star) return { kind: 'star', id: star };

  let line: string | null = null;
  best = LINE_REACH;
  const skyZoom = scene.level === 'sky';
  for (const dep of sky.dependencies) {
    if (!shown.star(dep.blocker) || !shown.star(dep.blocked)) continue;
    const a = scene.where(dep.blocker);
    const b = scene.where(dep.blocked);
    if (!a || !b) continue;
    const short = distance(toScreen(a, camera), toScreen(b, camera)) < SHORT_LANE;
    if (skyZoom && dep.kind === 'lane' && short) continue;
    const curve = edgeCurve(a, b, dep.kind === 'hyperlane');
    const path = samples(curve, CURVE_SAMPLES).map((p) => toScreen(p, camera));
    const d = distanceToPath(path, screen);
    if (d < best) {
      best = d;
      line = dep.id;
    }
  }
  if (line) return { kind: 'line', id: line };

  if (!shown.fog) return null;
  let fog: string | null = null;
  best = FOG_REACH;
  for (const f of layout.fog) {
    const d = distance(toScreen(f, camera), screen);
    if (d < best) {
      best = d;
      fog = f.id;
    }
  }
  return fog ? { kind: 'fog', id: fog } : null;
}

function distanceToPath(path: Point[], p: Point): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const l2 = vx * vx + vy * vy || 1;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    best = Math.min(best, Math.hypot(a.x + vx * u - p.x, a.y + vy * u - p.y));
  }
  return best;
}

export function touched(sky: RoutedSky, selection: Selection): Set<string> | null {
  if (!selection) return null;
  if (selection.kind === 'line') {
    const dep = sky.dependencies.find((d) => d.id === selection.id);
    return new Set(dep ? [dep.blocker, dep.blocked] : []);
  }
  if (selection.kind === 'fog') return new Set(sky.mapId ? [sky.mapId] : []);
  const id = selection.id;
  const set = new Set([id]);
  for (const d of sky.dependencies) {
    if (d.blocker === id) set.add(d.blocked);
    if (d.blocked === id) set.add(d.blocker);
  }
  const indexed = sky.index.get(id);
  const star = indexed?.star;
  if (star?.kind === 'system') {
    for (const c of star.system.childIds) set.add(c);
    for (const t of sky.tickets) if (t.systemId === id) set.add(t.id);
    for (const c of closedChildren(sky, id)) set.add(c.id);
  }
  if (indexed?.home) set.add(indexed.home);
  return set;
}
