import { describe, expect, it } from 'vitest';
import type { Sky } from '@contract/sky';
import { harborSky, unitsRoute, withClosedArc, withClosedRoute } from '@app/sky/testing/harbor-sky';
import { layoutSky } from './layout';
import { withRoute } from './route';
import { LOOSE } from './types';
import { routeOf, shownIn } from './visibility';

const base = withClosedArc(harborSky());
const none = new Set<string>();

describe('a star under the filter', () => {
  const tied = base.tickets.find((t) => t.systemId === '602')!;
  const unfiled = { ...tied, id: '9001', handle: '#9001', number: 9001, systemId: '999' };
  const sky = withRoute({ ...base, tickets: [...base.tickets, unfiled] }, null);
  const star = (hidden: string[], id: string) => shownIn(sky, new Set(hidden), null).star(id);

  it('hides a ticket with its System, and one whose System is off the Sky with the Loose tickets', () => {
    expect(star(['602'], tied.id)).toBe(false);
    expect(star([LOOSE], tied.id)).toBe(true);
    expect(star([LOOSE], unfiled.id)).toBe(false);
    expect(star(['999'], unfiled.id)).toBe(true);
  });

  it('agrees with the layout, which orbits that ticket on the Loose ring', () => {
    const layout = layoutSky(sky);
    const placed = layout.stars.get(unfiled.id)!;
    expect([layout.looseRing, layout.looseRing! + 48]).toContain(placed.orbit!.r);
  });

  it('keeps an Ember while anything it blocks is shown', () => {
    const ember = sky.embers.find((e) => e.id === '601')!;
    expect(ember.blocks.sort()).toEqual(['558', '602']);
    expect(star(['602'], '601')).toBe(true);
    expect(star(['602', '558'], '601')).toBe(false);
  });

  it('shows a System disc, the Loose ring and the Fog until their key is hidden', () => {
    const shown = shownIn(sky, new Set(['602', LOOSE, '512']), null);
    expect([shown.area('602'), shown.area(LOOSE), shown.area('586'), shown.fog]).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(shownIn(sky, new Set(['602']), null).fog).toBe(true);
  });
});

describe('a closed route', () => {
  const routed = withClosedRoute(base);
  const unread = withRoute(base, null);

  it('shows while its System, one of its closed tickets or one of their Lanes is selected', () => {
    expect(routeOf(routed, { kind: 'star', id: '292' })).toBe('292');
    expect(routeOf(routed, { kind: 'star', id: '291' })).toBe('292');
    expect(routeOf(routed, { kind: 'line', id: '290->289' })).toBe('292');
    expect(routeOf(routed, { kind: 'star', id: '293' })).toBeNull();
    expect(routeOf(routed, { kind: 'star', id: '602' })).toBeNull();
    expect(routeOf(routed, null)).toBeNull();
  });

  it('opens on a System with closed children before its route is read, never on a closed System', () => {
    expect(routeOf(unread, { kind: 'star', id: '292' })).toBe('292');
    const closed: Sky = {
      ...base,
      systems: base.systems.map((s) => (s.id === '292' ? { ...s, closed: true } : s)),
    };
    expect(routeOf(withRoute(closed, null), { kind: 'star', id: '292' })).toBeNull();
    expect(withRoute(closed, unitsRoute()).route).toBeUndefined();
  });

  it('draws its closed tickets only with the route, and hides them with their System', () => {
    expect(shownIn(routed, none, null).star('290')).toBe(false);
    expect(shownIn(routed, none, '602').star('290')).toBe(false);
    expect(shownIn(routed, none, '292').star('290')).toBe(true);
    expect(shownIn(routed, new Set(['292']), '292').star('290')).toBe(false);
  });

  it('keeps a closed ticket on its route while the filter hides it', () => {
    expect(shownIn(routed, new Set(['292']), '292').onRoute('290')).toBe(true);
    expect(shownIn(routed, none, null).onRoute('290')).toBe(false);
    expect(shownIn(routed, none, null).onRoute('293')).toBe(true);
  });

  it('leaves an Ember that is also a closed child on the sky, and never opens the route from it', () => {
    const ember = base.embers[0]!;
    const route = unitsRoute();
    const sky = withRoute(base, { ...route, children: [...route.children, { ...ember }] });
    expect(shownIn(sky, none, null).star(ember.id)).toBe(true);
    expect(routeOf(sky, { kind: 'star', id: ember.id })).toBeNull();
  });
});
