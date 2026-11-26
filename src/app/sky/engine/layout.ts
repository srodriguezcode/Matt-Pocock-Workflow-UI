import type { IssueRef, Light, Sky, System, Ticket } from '@contract/sky';
import { closedChildren, looseTickets, type RoutedSky } from './route';
import type { Disc, Layout, PlacedFog, PlacedStar, Point } from './types';

const TAU = Math.PI * 2;

const RING_STEP = 58;
const FIRST_RING = 74;
/** Arc length kept between neighbours on a ticket ring, in world px. */
const TICKET_ARC = 50;
const DISC_PAD = 46;
/** Closed-route rings pack tighter than open ones: an Ember is small and carries only a number. */
const BAND_STEP = 44;
const BAND_ARC = 40;
const FOG_GAP = 40;
const FOG_PAD = 70;
const EMPTY_CORE_R = 60;
const RING_GAP = 50;
export const DISC_GAP = 40;
const LOOSE_GAP = 80;
const LOOSE_ROW = 48;
const LOOSE_ARC = 92;
/** One lap per 15 minutes. */
const LOOSE_SPEED = TAU / 900;
const EMBER_PUSH = 46;

const LOOSE_ORDER: Light[] = [
  'frontier',
  'yours',
  'decision-frontier',
  'idle',
  'in-flight',
  'undecided',
  'blocked',
];

interface Kid {
  id: string;
  blockers: string[];
}

interface DiscDraft {
  system: System;
  r: number;
  fogR: number | null;
  x: number;
  y: number;
  local: Map<string, Point>;
}

export function layoutSky(sky: RoutedSky): Layout {
  const byNumber = (a: IssueRef, b: IssueRef) =>
    (a.number ?? Infinity) - (b.number ?? Infinity) || a.id.localeCompare(b.id);
  const systemOf = (id: string): string | null => sky.index.get(id)?.home ?? null;

  const blockers = new Map<string, string[]>();
  for (const d of sky.dependencies)
    blockers.set(d.blocked, [...(blockers.get(d.blocked) ?? []), d.blocker]);
  const embers = new Set(sky.embers.map((e) => e.id));
  const drafts = [...sky.systems].sort(byNumber).map((system) => {
    const kids = sky.tickets
      .filter((t) => t.systemId === system.id)
      .sort(byNumber)
      .map((t) => ({ id: t.id, blockers: t.openBlockers }));
    const route = closedChildren(sky, system.id)
      .filter((c) => !embers.has(c.id))
      .sort(byNumber)
      .map((c) => ({ id: c.id, blockers: blockers.get(c.id) ?? [] }));
    const band = { slots: system.closed ? 0 : system.arc.closed, kids: route };
    return draftDisc(system, kids, band, system.id === sky.mapId && sky.fog.length > 0);
  });
  const closed = new Set(sky.route?.children.map((c) => c.id).filter((id) => !embers.has(id)));
  const core = drafts.find((d) => d.system.id === sky.mapId) ?? null;
  const coreR = core?.r ?? EMPTY_CORE_R;
  const around = orderByHyperlanes(
    drafts.filter((d) => d !== core),
    linkCounter(sky, systemOf),
  );
  placeOnRing(around, coreR);

  const stars = new Map<string, PlacedStar>();
  const discs: Disc[] = [];
  for (const d of drafts) {
    for (const [id, p] of d.local) {
      const role = id === d.system.id ? 'system' : closed.has(id) ? 'closed' : 'ticket';
      stars.set(id, { id, role, x: d.x + p.x, y: d.y + p.y, orbit: null });
    }
    discs.push({ systemId: d.system.id, x: d.x, y: d.y, r: d.r, fogR: d.fogR });
  }

  const loose = looseTickets(sky);
  const edge = Math.max(coreR, ...drafts.map((d) => Math.hypot(d.x, d.y) + d.r));
  const looseRing = loose.length ? edge + LOOSE_GAP : null;
  if (looseRing !== null) placeLoose(sky, loose, looseRing, stars);

  const fog: PlacedFog[] = [];
  if (core?.fogR != null) {
    const angles = spreadAngles(
      sky.fog.map(() => null),
      0.5,
    );
    sky.fog.forEach((f, i) =>
      fog.push({
        id: f.id,
        x: core.x + Math.cos(angles[i]!) * core.fogR!,
        y: core.y + Math.sin(angles[i]!) * core.fogR!,
      }),
    );
  }

  placeEmbers(sky, stars, discs, systemOf);
  return { stars, discs, fog, looseRing };
}

/**
 * The closed route takes the inner rings, sized from `band.slots` alone, so open tickets sit
 * where they would with the route unread.
 */
function draftDisc(
  system: System,
  kids: Kid[],
  band: { slots: number; kids: Kid[] },
  withFog: boolean,
): DiscDraft {
  const local = new Map<string, Point>([[system.id, { x: 0, y: 0 }]]);
  const bandRings = reserveRings(band.slots);
  fillBand(band.kids, bandRings, local);
  let r = bandRings.at(-1)?.r ?? 0;
  const depth = laneDepths(kids);
  const rings: Kid[][] = [];
  for (const k of kids) (rings[depth.get(k.id)!] ??= []).push(k);
  for (const ring of rings) {
    if (!ring) continue;
    r = Math.max(r + RING_STEP, FIRST_RING, (ring.length * TICKET_ARC) / TAU);
    placeRing(ring, r, TICKET_ARC, local);
  }
  let discR = Math.max(r, 30) + DISC_PAD;
  let fogR: number | null = null;
  if (withFog) {
    fogR = discR + FOG_GAP;
    discR = fogR + FOG_PAD;
  }
  return { system, r: discR, fogR, x: 0, y: 0, local };
}

function placeRing(ring: Kid[], r: number, arc: number, local: Map<string, Point>): void {
  const targets = ring.map((k): number | null => {
    const placed = k.blockers
      .map((b) => local.get(b))
      .filter((p): p is Point => !!p && (p.x !== 0 || p.y !== 0));
    const c = average(placed);
    return c ? Math.atan2(c.y, c.x) : null;
  });
  const free = targets.every((t) => t === null) && ring.length < 3;
  const angles = free ? ring.map((_, i) => -Math.PI / 2 + i * 0.9) : spreadAngles(targets, arc / r);
  ring.forEach((k, i) =>
    local.set(k.id, { x: Math.cos(angles[i]!) * r, y: Math.sin(angles[i]!) * r }),
  );
}

interface BandRing {
  r: number;
  capacity: number;
}

function reserveRings(slots: number): BandRing[] {
  const rings: BandRing[] = [];
  let r = 0;
  for (let left = slots; left > 0; left -= rings.at(-1)!.capacity) {
    r = Math.max(r + BAND_STEP, FIRST_RING);
    rings.push({ r, capacity: Math.floor((TAU * r) / BAND_ARC) });
  }
  return rings;
}

/**
 * Inner rings first, in lane-depth order. A deeper group starts a fresh ring while the rings
 * beyond still hold everything left. Whatever overflows crowds onto the last ring.
 */
function fillBand(kids: Kid[], rings: BandRing[], local: Map<string, Point>): void {
  if (!rings.length || !kids.length) return;
  const depth = laneDepths(kids);
  const order = [...kids].sort((a, b) => depth.get(a.id)! - depth.get(b.id)!);
  const placed: Kid[][] = rings.map(() => []);
  let i = 0;
  order.forEach((k, n) => {
    const room = (from: number) => rings.slice(from).reduce((sum, ring) => sum + ring.capacity, 0);
    const newDepth = n > 0 && depth.get(k.id) !== depth.get(order[n - 1]!.id);
    if (newDepth && placed[i]!.length && i + 1 < rings.length && room(i + 1) >= order.length - n)
      i++;
    while (placed[i]!.length >= rings[i]!.capacity && i + 1 < rings.length) i++;
    placed[i]!.push(k);
  });
  placed.forEach((ring, n) => placeRing(ring, rings[n]!.r, BAND_ARC, local));
}

function laneDepths(kids: Kid[]): Map<string, number> {
  const byId = new Map(kids.map((k) => [k.id, k]));
  const depth = new Map<string, number>();
  const visit = (k: Kid, seen: Set<string>): number => {
    const known = depth.get(k.id);
    if (known !== undefined) return known;
    if (seen.has(k.id)) return 0;
    seen.add(k.id);
    let d = 0;
    for (const b of k.blockers) {
      const sibling = byId.get(b);
      if (sibling) d = Math.max(d, visit(sibling, seen) + 1);
    }
    depth.set(k.id, d);
    return d;
  };
  for (const k of kids) visit(k, new Set());
  return depth;
}

function linkCounter(sky: Sky, systemOf: (id: string) => string | null) {
  const counts = new Map<string, number>();
  const key = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);
  for (const d of sky.dependencies) {
    if (d.kind !== 'hyperlane') continue;
    const a = systemOf(d.blocker);
    const b = systemOf(d.blocked);
    if (a && b && a !== b) counts.set(key(a, b), (counts.get(key(a, b)) ?? 0) + 1);
  }
  return (a: DiscDraft, b: DiscDraft) => counts.get(key(a.system.id, b.system.id)) ?? 0;
}

function orderByHyperlanes(
  discs: DiscDraft[],
  links: (a: DiscDraft, b: DiscDraft) => number,
): DiscDraft[] {
  const left = new Set(discs);
  const order: DiscDraft[] = [];
  let seed: [DiscDraft, DiscDraft] | null = null;
  let seedScore = 0;
  for (const [i, a] of discs.entries()) {
    for (const b of discs.slice(i + 1)) {
      const score = links(a, b);
      if (score > seedScore) {
        seedScore = score;
        seed = [a, b];
      }
    }
  }
  for (const d of seed ?? []) {
    order.push(d);
    left.delete(d);
  }
  while (left.size) {
    let best: DiscDraft | null = null;
    let atFront = false;
    let bestScore = -1;
    for (const d of left) {
      const back = order.length ? links(order.at(-1)!, d) : 0;
      const front = order.length ? links(order[0]!, d) : 0;
      const score = Math.max(back, front) * 100 + d.r / 1000;
      if (score > bestScore) {
        bestScore = score;
        best = d;
        atFront = front > back;
      }
    }
    if (atFront) order.unshift(best!);
    else order.push(best!);
    left.delete(best!);
  }
  return order;
}

function placeOnRing(order: DiscDraft[], coreR: number): void {
  const maxR = Math.max(0, ...order.map((d) => d.r));
  const ringR = coreR + maxR + RING_GAP;
  const total = order.reduce((t, d) => t + d.r, 0);
  let acc = 0;
  for (const d of order) {
    const a = -Math.PI / 2 + ((acc + d.r / 2) / total) * TAU;
    acc += d.r;
    d.x = Math.cos(a) * ringR;
    d.y = Math.sin(a) * ringR;
  }
  for (let it = 0; it < 200; it++) {
    separate(order);
    for (const d of order) {
      const dist = Math.hypot(d.x, d.y) || 1;
      const min = coreR + d.r + DISC_GAP;
      const f = dist < min ? min / dist : 0.995;
      d.x *= f;
      d.y *= f;
    }
  }
  separate(order);
}

function separate(order: DiscDraft[]): void {
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      const a = order[i]!;
      const b = order[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const min = a.r + b.r + DISC_GAP;
      if (d >= min) continue;
      const push = (min - d) / 2;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      b.x += (dx / d) * push;
      b.y += (dy / d) * push;
    }
  }
}

/** Two alternating rows. A Loose ticket with a line faces what it links to. */
function placeLoose(sky: Sky, loose: Ticket[], ring: number, stars: Map<string, PlacedStar>) {
  const order = [...loose].sort(
    (a, b) =>
      LOOSE_ORDER.indexOf(a.light) - LOOSE_ORDER.indexOf(b.light) ||
      (a.number ?? Infinity) - (b.number ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
  const targets = order.map((t) => {
    const linked = sky.dependencies
      .flatMap((d) => (d.blocker === t.id ? [d.blocked] : d.blocked === t.id ? [d.blocker] : []))
      .map((id) => stars.get(id))
      .filter((p): p is PlacedStar => !!p);
    const c = average(linked);
    return c ? Math.atan2(c.y, c.x) : null;
  });
  const free = targets.filter((t) => t === null).length;
  let fi = 0;
  targets.forEach((t, i) => {
    if (t === null) targets[i] = -Math.PI / 2 + ((fi++ + 0.5) / Math.max(1, free)) * TAU;
  });
  const angles = spreadAngles(targets, LOOSE_ARC / ring);
  order.forEach((t, i) => {
    const r = ring + (i % 2) * LOOSE_ROW;
    const a = angles[i]!;
    stars.set(t.id, {
      id: t.id,
      role: 'ticket',
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      orbit: { r, a, w: LOOSE_SPEED },
    });
  });
}

/** Between what it blocks, pushed out from the first one's disc. Several Systems pull it between them. */
function placeEmbers(
  sky: Sky,
  stars: Map<string, PlacedStar>,
  discs: Disc[],
  systemOf: (id: string) => string | null,
): void {
  for (const e of sky.embers) {
    const blocked = e.blocks.map((id) => stars.get(id)).filter((p): p is PlacedStar => !!p);
    const c = average(blocked);
    const seed = e.number ?? hash(e.id);
    let at: Point = { x: 0, y: 0 };
    if (c) {
      const home = discs.find((d) => d.systemId === systemOf(blocked[0]!.id)) ?? { x: 0, y: 0 };
      const dx = c.x - home.x;
      const dy = c.y - home.y;
      const d = Math.hypot(dx, dy) || 1;
      at = {
        x: c.x + (dx / d) * EMBER_PUSH + ((seed % 3) - 1) * 10,
        y: c.y + (dy / d) * EMBER_PUSH + (seed % 2) * 12,
      };
    }
    stars.set(e.id, { id: e.id, role: 'ember', x: at.x, y: at.y, orbit: null });
  }
}

/** Spreads target angles (null = no preference) to at least `minSep` apart around a full circle. */
export function spreadAngles(targets: (number | null)[], minSep: number): number[] {
  const n = targets.length;
  if (!n) return [];
  const items = targets.map((t, i) => ({ i, a: t ?? -Math.PI / 2 + (i * TAU) / n }));
  const sep = Math.min(minSep, TAU / n);
  for (let it = 0; it < 120 && n > 1; it++) {
    items.sort((p, q) => p.a - q.a);
    for (let k = 0; k < n; k++) {
      const p = items[k]!;
      const q = items[(k + 1) % n]!;
      const d = q.a - p.a + (k === n - 1 ? TAU : 0);
      if (d < sep) {
        const push = (sep - d) / 2;
        p.a -= push;
        q.a += push;
      }
    }
  }
  const out: number[] = [];
  for (const p of items) out[p.i] = p.a;
  return out;
}

function average(points: Point[]): Point | null {
  if (!points.length) return null;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
