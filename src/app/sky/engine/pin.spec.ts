import type { Sky, Ticket } from '@contract/sky';
import { describe, expect, it } from 'vitest';
import { harborSky } from '@app/sky/testing/harbor-sky';
import { layoutSky } from './layout';
import { gateChanges, pinLayout, TWEEN_S, tweenedAt } from './pin';
import { withRoute } from './route';
import type { Layout } from './types';

const laidOut = (sky: Sky) => layoutSky(withRoute(sky, null));
const base = harborSky();
const before = laidOut(base);

function ticket(sky: Sky, id: string): Ticket {
  const t = sky.tickets.find((x) => x.id === id);
  if (!t) throw new Error(`no ticket ${id}`);
  return t;
}

function withTicket(sky: Sky, t: Ticket): Sky {
  return { ...sky, tickets: [...sky.tickets.filter((x) => x.id !== t.id), t] };
}

function without(sky: Sky, id: string): Sky {
  return {
    ...sky,
    tickets: sky.tickets.filter((t) => t.id !== id),
    dependencies: sky.dependencies.filter((d) => d.blocker !== id && d.blocked !== id),
    embers: sky.embers.map((e) => ({ ...e, blocks: e.blocks.filter((b) => b !== id) })),
  };
}

function refresh(next: Sky, prev: Layout = before) {
  return pinLayout(prev, laidOut(next));
}

function expectPinned(after: Layout, skip: string[] = []): void {
  for (const [id, star] of before.stars) {
    if (skip.includes(id) || !after.stars.has(id)) continue;
    expect(after.stars.get(id), id).toMatchObject({ x: star.x, y: star.y, orbit: star.orbit });
  }
}

function shifted(after: Layout): number {
  return [...before.stars].filter(([id, s]) => {
    const a = after.stars.get(id);
    return a && Math.hypot(a.x - s.x, a.y - s.y) > 0.01;
  }).length;
}

function expectApart(layout: Layout): void {
  const discs = layout.discs;
  for (let i = 0; i < discs.length; i++) {
    for (let j = i + 1; j < discs.length; j++) {
      const a = discs[i]!;
      const b = discs[j]!;
      const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
      expect(gap, `${a.systemId} ${b.systemId}`).toBeGreaterThanOrEqual(0);
    }
  }
}

function inside(layout: Layout, id: string, systemId: string): boolean {
  const star = layout.stars.get(id)!;
  const d = layout.discs.find((x) => x.systemId === systemId)!;
  return Math.hypot(star.x - d.x, star.y - d.y) <= d.r;
}

describe('pinLayout', () => {
  it('takes the fresh layout on the first read', () => {
    const next = laidOut(base);
    expect(pinLayout(null, next)).toEqual({ layout: next, moved: new Map() });
  });

  it('keeps every star in place when nothing changed', () => {
    const { layout, moved } = refresh(base);
    expectPinned(layout);
    expect(moved.size).toBe(0);
  });

  it('keeps every other star in place when a ticket joins a System', () => {
    const added = { ...ticket(base, '643'), id: '999', number: 999, openBlockers: [] };
    const next = withTicket(base, added);
    expect(shifted(laidOut(next))).toBeGreaterThan(0);
    const { layout, moved } = refresh(next);
    expectPinned(layout);
    expect([...moved.keys()]).toEqual(['999']);
    expect(inside(layout, '999', '602')).toBe(true);
    const core = layout.stars.get('602')!;
    expect(moved.get('999')).toEqual({ x: core.x, y: core.y });
  });

  it('keeps every other star in place when a Loose ticket or a System arrives', () => {
    const loose = { ...ticket(base, '595'), id: '998', number: 998 };
    const spec = {
      ...base.systems.find((s) => s.id === '586')!,
      id: '997',
      number: 997,
      state: 'needs-tickets' as const,
      childIds: [],
    };
    const next = withTicket({ ...base, systems: [...base.systems, spec] }, loose);
    expect(shifted(laidOut(next))).toBeGreaterThan(0);
    const { layout, moved } = refresh(next);
    expectPinned(layout);
    expect([...moved.keys()].sort()).toEqual(['997', '998']);
    for (const d of before.discs) {
      expect(layout.discs.find((x) => x.systemId === d.systemId)).toMatchObject({ x: d.x, y: d.y });
    }
    expectApart(layout);
    expect(inside(layout, '997', '997')).toBe(true);
  });

  it('keeps a new System with tickets clear of the pinned discs, its tickets inside it', () => {
    const spec = { ...base.systems.find((s) => s.id === '586')!, id: '996', number: 996 };
    const kids = base.tickets
      .filter((t) => t.systemId === '586')
      .map((t, i) => ({ ...t, id: `90${i}`, number: 900 + i, systemId: '996', openBlockers: [] }));
    const next = { ...base, systems: [...base.systems, spec], tickets: [...base.tickets, ...kids] };
    const { layout } = refresh(next);
    expectPinned(layout);
    expectApart(layout);
    for (const k of kids) expect(inside(layout, k.id, '996')).toBe(true);
  });

  it('keeps every other star in place when a ticket leaves', () => {
    const next = without(base, '587');
    expect(shifted(laidOut(next))).toBeGreaterThan(0);
    const { layout, moved } = refresh(next);
    expect(layout.stars.has('587')).toBe(false);
    expectPinned(layout);
    expect(moved.size).toBe(0);
  });

  it('keeps the removals pinned across a second refresh', () => {
    const first = refresh(without(base, '587')).layout;
    const { layout, moved } = refresh(without(without(base, '587'), '565'), first);
    expectPinned(layout);
    expect(moved.size).toBe(0);
  });

  it('moves a ticket that changed System, starting from where it was', () => {
    const next = withTicket(base, { ...ticket(base, '587'), systemId: '558' });
    const { layout, moved } = refresh(next);
    expectPinned(layout, ['587']);
    expect([...moved.keys()]).toEqual(['587']);
    expect(moved.get('587')).toEqual({
      x: before.stars.get('587')!.x,
      y: before.stars.get('587')!.y,
    });
    expect(inside(layout, '587', '558')).toBe(true);
  });
});

describe('gateChanges', () => {
  it('names the stars whose light or System state changed, and no new ones', () => {
    const next: Sky = {
      ...base,
      tickets: [
        ...base.tickets.map((t) => (t.id === '634' ? { ...t, light: 'in-flight' as const } : t)),
        { ...ticket(base, '595'), id: '998' },
      ],
      systems: base.systems.map((s) => (s.id === '586' ? { ...s, gated: !s.gated } : s)),
    };
    expect(gateChanges(base, next)).toEqual(new Set(['634', '586']));
  });

  it('names nothing on the first read', () => {
    expect(gateChanges(null, base).size).toBe(0);
  });
});

describe('tweenedAt', () => {
  it('starts at the tween origin and lands on the placed star', () => {
    const star = before.stars.get('643')!;
    const tween = { from: { x: 0, y: 0 }, t0: 10 };
    expect(tweenedAt(star, tween, 10)).toEqual({ x: 0, y: 0 });
    expect(tweenedAt(star, tween, 10 + TWEEN_S)).toEqual({ x: star.x, y: star.y });
  });
});
