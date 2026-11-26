import { describe, expect, it } from 'vitest';
import { harborSky } from '@app/sky/testing/harbor-sky';
import { type SceneOptions, testScene } from '@app/sky/testing/scene';
import { edgeCurve, pointOn } from './curve';
import { positionAt, toScreen } from './geometry';
import { hitTest, SHORT_LANE, touched } from './hit';
import { layoutSky } from './layout';
import { withRoute } from './route';
import type { Point, Scene } from './types';
import { LOOSE } from './types';

const sky = withRoute(harborSky(), null);
const layout = layoutSky(sky);

function scene(over: SceneOptions = {}): Scene {
  return testScene(sky, layout, { camera: { x: 600, y: 400, s: 0.8 }, level: 'system', ...over });
}

function screenOf(s: Scene, id: string): Point {
  return toScreen(positionAt(layout.stars.get(id)!, s.t), s.camera);
}

function lineMid(s: Scene, id: string): Point {
  const dep = sky.dependencies.find((d) => d.id === id)!;
  const a = positionAt(layout.stars.get(dep.blocker)!, s.t);
  const b = positionAt(layout.stars.get(dep.blocked)!, s.t);
  return toScreen(pointOn(edgeCurve(a, b, dep.kind === 'hyperlane'), 0.5), s.camera);
}

const nudge = (p: Point, dx: number, dy = 0): Point => ({ x: p.x + dx, y: p.y + dy });

describe('hitTest', () => {
  it('selects the star under the pointer, within 10 px', () => {
    const s = scene();
    expect(hitTest(s, screenOf(s, '633'))).toEqual({ kind: 'star', id: '633' });
    expect(hitTest(s, nudge(screenOf(s, '633'), 6, 6))).toEqual({ kind: 'star', id: '633' });
    expect(hitTest(s, nudge(screenOf(s, '600'), 0, -8))).toEqual({ kind: 'star', id: '600' });
  });

  it('selects a line on its curve when no star is near', () => {
    const s = scene({ camera: { x: 600, y: 400, s: 2 } });
    const mid = lineMid(s, '602->558');
    expect(hitTest(s, mid)).toEqual({ kind: 'line', id: '602->558' });
    expect(hitTest(s, nudge(mid, 0, 5))).toEqual({ kind: 'line', id: '602->558' });
  });

  it('ignores a short Lane at sky zoom and selects it from system zoom', () => {
    const camera = { x: 600, y: 400, s: 0.9 };
    const far = scene({ camera, level: 'sky' });
    const [a, b] = [screenOf(far, '633'), screenOf(far, '636')];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(SHORT_LANE);
    expect(hitTest(far, lineMid(far, '633->636'))).toBeNull();
    const near = scene({ camera, level: 'system' });
    expect(hitTest(near, lineMid(near, '633->636'))).toEqual({ kind: 'line', id: '633->636' });
  });

  it('keeps a long Hyperlane clickable at sky zoom', () => {
    const far = scene({ camera: { x: 600, y: 400, s: 0.3 }, level: 'sky' });
    expect(hitTest(far, lineMid(far, '602->558'))).toEqual({ kind: 'line', id: '602->558' });
  });

  it('prefers a star over a line that passes just as close', () => {
    const s = scene();
    const star = screenOf(s, '634');
    expect(hitTest(s, nudge(star, 3))).toEqual({ kind: 'star', id: '634' });
  });

  it('selects Fog after stars and lines, within 34 px of its centre', () => {
    const s = scene({ camera: { x: 600, y: 400, s: 1.5 } });
    const fog = layout.fog[0]!;
    expect(hitTest(s, nudge(toScreen(fog, s.camera), 25))).toEqual({ kind: 'fog', id: fog.id });
  });

  it('returns null on empty space', () => {
    expect(hitTest(scene(), { x: 5, y: 5 })).toBeNull();
  });

  it('finds a Loose ticket where its orbit has carried it', () => {
    const s = scene({ t: 120 });
    const moved = screenOf(s, '595');
    expect(moved).not.toEqual(screenOf(scene(), '595'));
    expect(hitTest(s, moved)).toEqual({ kind: 'star', id: '595' });
  });

  it('finds a star where it is drawn mid-tween, not where its layout puts it', () => {
    const s = scene();
    const drawn = { x: 40, y: -30 };
    const tweening = scene({ where: (id) => (id === '633' ? drawn : s.where(id)) });
    expect(hitTest(tweening, toScreen(drawn, s.camera))).toEqual({ kind: 'star', id: '633' });
  });

  it('skips stars and lines of hidden Systems, and Fog when the Map is hidden', () => {
    const s = scene({ hidden: new Set(['602', LOOSE]) });
    expect(hitTest(s, screenOf(s, '633'))).toBeNull();
    expect(hitTest(s, screenOf(s, '595'))).toBeNull();
    const fogged = scene({ hidden: new Set(['512']), camera: { x: 600, y: 400, s: 1.5 } });
    expect(hitTest(fogged, toScreen(layout.fog[0]!, fogged.camera))).toBeNull();
  });
});

describe('touched', () => {
  it('lights a ticket, its blockers, what it blocks and its System', () => {
    const lit = touched(sky, { kind: 'star', id: '636' })!;
    expect([...lit].sort()).toEqual(['602', '633', '636', '641', '643']);
  });

  it('lights a System with its tickets and its Dependencies', () => {
    const lit = touched(sky, { kind: 'star', id: '559' })!;
    expect([...lit].sort()).toEqual(['558', '559', '565', '566', '567', '568']);
  });

  it('lights both ends of a line, and the Map for Fog', () => {
    expect(touched(sky, { kind: 'line', id: '602->558' })).toEqual(new Set(['602', '558']));
    expect(touched(sky, { kind: 'fog', id: 'fog-1' })).toEqual(new Set(['512']));
  });

  it('dims nothing without a selection', () => {
    expect(touched(sky, null)).toBeNull();
  });
});
