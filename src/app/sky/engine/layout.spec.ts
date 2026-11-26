import type { Sky } from '@contract/sky';
import { describe, expect, it } from 'vitest';
import { harborSky } from '@app/sky/testing/harbor-sky';
import { layoutSky } from './layout';
import { withRoute } from './route';
import type { Disc, Layout } from './types';

const TAU = Math.PI * 2;

function disc(layout: Layout, id: string): Disc {
  const d = layout.discs.find((x) => x.systemId === id);
  if (!d) throw new Error(`no disc for ${id}`);
  return d;
}

function at(layout: Layout, id: string) {
  const star = layout.stars.get(id);
  if (!star) throw new Error(`no star ${id}`);
  return star;
}

function withoutMap(sky: Sky): Sky {
  const mapId = sky.mapId!;
  const gone = new Set([
    mapId,
    ...sky.tickets.filter((t) => t.systemId === mapId).map((t) => t.id),
  ]);
  return {
    ...sky,
    mapId: null,
    fog: [],
    systems: sky.systems.filter((s) => !gone.has(s.id)),
    tickets: sky.tickets.filter((t) => !gone.has(t.id)),
    embers: sky.embers.map((e) => ({ ...e, blocks: e.blocks.filter((b) => !gone.has(b)) })),
    dependencies: sky.dependencies.filter((d) => !gone.has(d.blocker) && !gone.has(d.blocked)),
  };
}

describe('layoutSky', () => {
  const sky = withRoute(harborSky(), null);
  const layout = layoutSky(sky);
  const others = layout.discs.filter((d) => d.systemId !== sky.mapId);

  it('places every star of the Sky', () => {
    const ids = [...sky.systems, ...sky.tickets, ...sky.embers].map((x) => x.id);
    expect([...layout.stars.keys()].sort()).toEqual(ids.sort());
  });

  it('puts the Map at the core and every other System on a ring around it', () => {
    const map = disc(layout, '512');
    expect(map).toMatchObject({ x: 0, y: 0 });
    const radii = others.map((d) => Math.hypot(d.x, d.y));
    for (const [i, d] of others.entries()) {
      expect(radii[i]).toBeGreaterThanOrEqual(map.r + d.r);
      expect(at(layout, d.systemId)).toMatchObject({ x: d.x, y: d.y, role: 'system' });
    }
    expect(Math.max(...radii) / Math.min(...radii)).toBeLessThan(1.6);
  });

  it('sits Hyperlane-linked Systems side by side around the ring', () => {
    const order = [...others]
      .sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x))
      .map((d) => d.systemId);
    const neighbours = (id: string) => {
      const i = order.indexOf(id);
      return [order.at(i - 1), order[(i + 1) % order.length]];
    };
    expect(neighbours('558')).toContain('602');
    expect(neighbours('558')).toContain('559');
  });

  it('keeps discs apart', () => {
    for (const [i, a] of layout.discs.entries()) {
      for (const b of layout.discs.slice(i + 1)) {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
      }
    }
  });

  it('puts tickets on rings by lane depth, deeper further out', () => {
    const d = disc(layout, '602');
    const radius = (id: string) => {
      const s = at(layout, id);
      return Math.hypot(s.x - d.x, s.y - d.y);
    };
    const depth0 = ['633', '640'].map(radius);
    const depth1 = ['634', '635', '636', '637', '638', '639'].map(radius);
    const depth2 = ['641', '642', '643'].map(radius);
    for (const ring of [depth0, depth1, depth2]) {
      for (const r of ring) expect(r).toBeCloseTo(ring[0]!, 6);
    }
    expect(depth1[0]).toBeGreaterThan(depth0[0]!);
    expect(depth2[0]).toBeGreaterThan(depth1[0]!);
    for (const s of ['633', '643']) expect(radius(s)).toBeLessThan(d.r);
  });

  it('angles a ticket toward its blocker', () => {
    const d = disc(layout, '558');
    const angle = (id: string) => {
      const s = at(layout, id);
      return Math.atan2(s.y - d.y, s.x - d.x);
    };
    const gap = Math.abs(angle('562') - angle('561')) % TAU;
    expect(Math.min(gap, TAU - gap)).toBeLessThan(Math.PI / 3);
  });

  it('orbits Loose tickets in two alternating rows, one lap per 15 minutes', () => {
    const loose = sky.tickets.filter((t) => t.systemId === null).map((t) => at(layout, t.id));
    const radii = new Set(loose.map((s) => s.orbit!.r));
    expect([...radii].sort()).toEqual([layout.looseRing, layout.looseRing! + 48]);
    for (const s of loose) expect(s.orbit!.w).toBeCloseTo(TAU / 900);
    const outermost = Math.max(...layout.discs.map((d) => Math.hypot(d.x, d.y) + d.r));
    expect(layout.looseRing).toBeGreaterThan(outermost);
  });

  it('draws Fog on the rim of the Map', () => {
    const map = disc(layout, '512');
    expect(layout.fog).toHaveLength(sky.fog.length);
    for (const f of layout.fog) expect(Math.hypot(f.x - map.x, f.y - map.y)).toBeCloseTo(map.fogR!);
    expect(map.fogR).toBeLessThan(map.r);
  });

  it('floats an Ember that blocks several Systems between them', () => {
    const a = disc(layout, '602');
    const b = disc(layout, '558');
    const ember = at(layout, '601');
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const span = Math.hypot(a.x - b.x, a.y - b.y);
    expect(Math.hypot(ember.x - mid.x, ember.y - mid.y)).toBeLessThan(span / 2);
    expect(ember.role).toBe('ember');
  });

  it('keeps an open ticket inside its closed parent System', () => {
    const closed = withRoute(
      {
        ...sky,
        systems: sky.systems.map((x) => (x.id === '292' ? { ...x, closed: true } : x)),
        tickets: sky.tickets.map((t) => (t.id === '293' ? { ...t, closedParentId: '292' } : t)),
      },
      null,
    );
    const l = layoutSky(closed);
    const d = disc(l, '292');
    const s = at(l, '293');
    expect(Math.hypot(s.x - d.x, s.y - d.y)).toBeLessThan(d.r);
  });

  it('leaves the core empty when there is no Map', () => {
    const bare = layoutSky(withRoute(withoutMap(sky), null));
    expect(bare.fog).toEqual([]);
    for (const d of bare.discs) expect(Math.hypot(d.x, d.y)).toBeGreaterThanOrEqual(d.r + 60);
  });

  it('gives the same layout for the same Sky', () => {
    const again = layoutSky(withRoute(harborSky(), null));
    expect(again.discs).toEqual(layout.discs);
    expect([...again.stars.entries()]).toEqual([...layout.stars.entries()]);
  });
});
