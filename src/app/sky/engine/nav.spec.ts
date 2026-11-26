import { describe, expect, it } from 'vitest';
import type { StartOption } from '@contract/launch';
import { harborSky, harborStarts } from '@app/sky/testing/harbor-sky';
import { type SceneOptions, testScene } from '@app/sky/testing/scene';
import { layoutSky } from './layout';
import { arrowTarget, startableOrder, stepThrough } from './nav';
import { withRoute } from './route';
import type { Scene } from './types';
import { LOOSE } from './types';

const sky = withRoute(harborSky(), null);
const layout = layoutSky(sky);
const starts = harborStarts();
const startFor = (id: string): StartOption | null => starts[id] ?? null;

function scene(over: SceneOptions = {}): Scene {
  return testScene(sky, layout, { camera: { x: 600, y: 400, s: 1 }, ...over });
}

describe('startableOrder', () => {
  it('lists Frontier systems, Frontier tickets, Decision frontier tickets, then the Map', () => {
    expect(startableOrder(scene(), startFor)).toEqual([
      ...['602', '292', '586'],
      ...['633', '640', '293', '587', '560', '405', '408', '502', '595'],
      '599',
      '512',
    ]);
  });

  it('walks Systems clockwise from the top, Loose tickets after them', () => {
    const systems = startableOrder(scene(), startFor).filter(
      (id) => startFor(id)?.target?.kind === 'system',
    );
    expect(systems).toEqual(['602', '292', '586']);
  });

  it('puts the ticket that unlocks most first inside a System', () => {
    const order = startableOrder(scene(), startFor);
    expect(order.indexOf('633')).toBeLessThan(order.indexOf('640'));
    expect(order.indexOf('560')).toBeLessThan(order.indexOf('408'));
  });

  it('skips hidden Systems and their tickets', () => {
    const order = startableOrder(scene({ hidden: new Set(['602', LOOSE, '512']) }), startFor);
    expect(order).toEqual(['292', '586', '293', '587']);
  });

  it('is empty when nothing can start', () => {
    expect(startableOrder(scene(), () => null)).toEqual([]);
  });
});

describe('stepThrough', () => {
  const order = ['a', 'b', 'c'];

  it('steps both ways and wraps', () => {
    expect(stepThrough(order, 'a', 1)).toBe('b');
    expect(stepThrough(order, 'c', 1)).toBe('a');
    expect(stepThrough(order, 'a', -1)).toBe('c');
  });

  it('starts at an end when the selection is not startable', () => {
    expect(stepThrough(order, null, 1)).toBe('a');
    expect(stepThrough(order, 'zz', -1)).toBe('c');
  });

  it('does nothing with nothing to step through', () => {
    expect(stepThrough([], 'a', 1)).toBeNull();
  });
});

describe('arrowTarget', () => {
  it('moves between System cores at sky zoom', () => {
    const s = scene({ level: 'sky' });
    expect(arrowTarget(s, '512', 'up')).toBe('586');
    expect(arrowTarget(s, '512', 'down')).toBe('559');
    expect(arrowTarget(s, '559', 'up')).toBe('512');
    expect(arrowTarget(s, '512', 'left')).toBe('292');
    expect(arrowTarget(s, '512', 'right')).toBe('558');
  });

  it('reaches Loose tickets but never a ticket inside a System at sky zoom', () => {
    const s = scene({ level: 'sky' });
    expect(arrowTarget(s, '558', 'up')).toBe('408');
    expect(arrowTarget(s, '633', 'left')).toBe('586');
    expect(arrowTarget(s, '633', 'down')).toBe('602');
  });

  it('moves between tickets once zoomed in', () => {
    const s = scene({ level: 'system' });
    expect(arrowTarget(s, '633', 'left')).toBe('634');
    expect(arrowTarget(s, '633', 'right')).toBe('639');
    expect(arrowTarget(s, '512', 'up')).toBe('599');
  });

  it('passes over hidden stars', () => {
    const s = scene({ level: 'sky', hidden: new Set(['558']) });
    expect(arrowTarget(s, '512', 'right')).not.toBe('558');
  });

  it('picks the star nearest the middle of the view with nothing selected', () => {
    expect(arrowTarget(scene({ level: 'sky' }), null, 'left')).toBe('512');
  });

  it('finds nothing past the edge', () => {
    const s = scene({ level: 'sky' });
    const east = [...layout.stars.values()].reduce((a, b) => (b.x > a.x ? b : a));
    expect(arrowTarget(s, east.id, 'right')).toBeNull();
  });
});
