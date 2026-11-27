import type { LaunchKind, StartOption } from '@contract/launch';
import { toWorld } from './geometry';
import { isLoose } from './route';
import type { Layout, Point, Scene } from './types';

export type Direction = 'up' | 'down' | 'left' | 'right';

const KIND_ORDER: LaunchKind[] = ['system', 'split', 'ticket', 'decision', 'map', 'triage'];

const TAU = Math.PI * 2;

/** Half-width of the arrow cone, as the tangent of 60°. */
const CONE = Math.tan(Math.PI / 3);
const SIDE_WEIGHT = 2;

const STEP: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function startableOrder(
  scene: Scene,
  startFor: (id: string) => StartOption | null,
): string[] {
  const { sky, layout, shown } = scene;
  const ring = ringRanks(layout);
  const rows = [
    ...sky.systems.map((s) => ({ id: s.id, number: s.number, unblocks: 0 })),
    ...sky.tickets.map((t) => ({ id: t.id, number: t.number, unblocks: t.unblocks.length })),
  ].flatMap((row) => {
    const option = startFor(row.id);
    if (!option?.enabled || !shown.star(row.id)) return [];
    const system = sky.index.get(row.id)?.home ?? null;
    const kind = KIND_ORDER.indexOf(option.target.kind);
    const place = system === null ? Infinity : (ring.get(system) ?? Infinity);
    return [{ ...row, kind, place }];
  });
  rows.sort(
    (a, b) =>
      a.kind - b.kind ||
      a.place - b.place ||
      b.unblocks - a.unblocks ||
      (a.number ?? Infinity) - (b.number ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
  return rows.map((r) => r.id);
}

function ringRanks(layout: Layout): Map<string, number> {
  return new Map(
    layout.discs.map((d) => {
      if (d.x === 0 && d.y === 0) return [d.systemId, -1];
      const turn = (Math.atan2(d.y, d.x) + Math.PI / 2 + TAU) % TAU;
      return [d.systemId, turn];
    }),
  );
}

export function stepThrough(order: string[], current: string | null, dir: 1 | -1): string | null {
  if (!order.length) return null;
  const at = current === null ? -1 : order.indexOf(current);
  if (at < 0) return dir > 0 ? order[0]! : order[order.length - 1]!;
  return order[(at + dir + order.length) % order.length]!;
}

export function arrowTarget(
  scene: Scene,
  fromId: string | null,
  direction: Direction,
): string | null {
  const { sky, layout, shown, level } = scene;
  const candidates = [...layout.stars.keys()].flatMap((id) => {
    if (id === fromId || !shown.star(id)) return [];
    const indexed = sky.index.get(id);
    if (level === 'sky' && indexed?.star.kind !== 'system' && !isLoose(indexed)) return [];
    const at = scene.where(id);
    return at ? [{ id, at }] : [];
  });

  const from = fromId ? scene.where(fromId) : null;
  if (!from) {
    const middle = toWorld({ x: scene.viewport.w / 2, y: scene.viewport.h / 2 }, scene.camera);
    return nearest(candidates, (c) => Math.hypot(c.at.x - middle.x, c.at.y - middle.y));
  }
  const step = STEP[direction];
  return nearest(candidates, (c) => {
    const dx = c.at.x - from.x;
    const dy = c.at.y - from.y;
    const along = dx * step.x + dy * step.y;
    const side = Math.abs(dx * step.y - dy * step.x);
    if (along <= 0 || side > along * CONE) return Infinity;
    return along + side * SIDE_WEIGHT;
  });
}

function nearest<T extends { id: string }>(items: T[], score: (item: T) => number): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  for (const item of items) {
    const s = score(item);
    if (s < bestScore) {
      bestScore = s;
      best = item.id;
    }
  }
  return best;
}
