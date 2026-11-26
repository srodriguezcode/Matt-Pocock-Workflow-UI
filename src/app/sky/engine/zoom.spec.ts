import { describe, expect, it } from 'vitest';
import { harborSky } from '@app/sky/testing/harbor-sky';
import { testScene } from '@app/sky/testing/scene';
import { STAR_FROM, STAR_SCALE, SYSTEM_FROM } from './camera';
import { positionAt, toScreen } from './geometry';
import { layoutSky } from './layout';
import { type RoutedSky, withRoute } from './route';
import type { Camera, Layout, Point } from './types';
import { skyFit, zoomGoal } from './zoom';

const sky = withRoute(harborSky(), null);
const layout = layoutSky(sky);
const viewport = { w: 1200, h: 800 };
const scene = testScene(sky, layout, { camera: { x: 600, y: 400, s: 0.3 }, viewport });

const at = (id: string, l: Layout = layout): Point => positionAt(l.stars.get(id)!, 0);
const inView = (p: Point, camera: Camera) => {
  const s = toScreen(p, camera);
  return s.x >= 0 && s.x <= viewport.w && s.y >= 0 && s.y <= viewport.h;
};

function oneSystem(): RoutedSky {
  const keep = new Set([
    '586',
    ...sky.tickets.filter((t) => t.systemId === '586').map((t) => t.id),
  ]);
  return withRoute(
    {
      ...sky,
      mapId: null,
      systems: sky.systems.filter((s) => s.id === '586'),
      tickets: sky.tickets.filter((t) => keep.has(t.id)),
      embers: [],
      fog: [],
      dependencies: sky.dependencies.filter((d) => keep.has(d.blocker) && keep.has(d.blocked)),
    },
    null,
  );
}

describe('zoomGoal', () => {
  it('frames every star and the Fog at sky zoom', () => {
    const camera = zoomGoal(scene, 'sky', null);
    expect(camera).toEqual(skyFit(scene));
    for (const id of layout.stars.keys()) expect(inView(at(id), camera)).toBe(true);
    for (const f of layout.fog) expect(inView(f, camera)).toBe(true);
  });

  it('fills the viewport with a small Sky at sky zoom, and zooms in from there', () => {
    const small = oneSystem();
    const smallLayout = layoutSky(small);
    const s = testScene(small, smallLayout, { camera: scene.camera, viewport });
    const camera = zoomGoal(s, 'sky', null);
    const disc = smallLayout.discs[0]!;
    expect(2 * disc.r * camera.s).toBeGreaterThan(viewport.h * 0.75);
    expect(inView({ x: disc.x, y: disc.y - disc.r }, camera)).toBe(true);
    expect(inView({ x: disc.x, y: disc.y + disc.r }, camera)).toBe(true);
    for (const id of smallLayout.stars.keys())
      expect(inView(at(id, smallLayout), camera)).toBe(true);
    expect(zoomGoal(s, 'system', '586').s).toBeGreaterThanOrEqual(camera.s);
    expect(zoomGoal(s, 'star', '587').s).toBeGreaterThanOrEqual(camera.s);
  });

  it("frames a ticket's System disc at system zoom", () => {
    const camera = zoomGoal(scene, 'system', '636');
    expect(camera.s).toBeGreaterThanOrEqual(SYSTEM_FROM);
    expect(camera.s).toBeLessThan(STAR_FROM);
    for (const t of sky.tickets.filter((x) => x.systemId === '602')) {
      expect(inView(at(t.id), camera)).toBe(true);
    }
    expect(inView(at('602'), camera)).toBe(true);
  });

  it('frames a Loose ticket with the stars it is linked to at system zoom', () => {
    const camera = zoomGoal(scene, 'system', '595');
    expect(camera.s).toBeGreaterThanOrEqual(SYSTEM_FROM);
    expect(inView(at('595'), camera)).toBe(true);
  });

  it('centres the star at star zoom', () => {
    const camera = zoomGoal(scene, 'star', '633');
    expect(camera.s).toBe(STAR_SCALE);
    const p = toScreen(at('633'), camera);
    expect(p.x).toBeCloseTo(viewport.w / 2);
    expect(p.y).toBeCloseTo(viewport.h / 2);
  });

  it('centres the star where it is drawn mid-tween', () => {
    const drawn = { x: 30, y: -40 };
    const tweening = { ...scene, where: (id: string) => (id === '633' ? drawn : scene.where(id)) };
    const p = toScreen(drawn, zoomGoal(tweening, 'star', '633'));
    expect(p.x).toBeCloseTo(viewport.w / 2);
    expect(p.y).toBeCloseTo(viewport.h / 2);
  });

  it('zooms about the current centre without a target', () => {
    const centre = { x: 100, y: -50 };
    const camera = { x: 600 - centre.x * 0.3, y: 400 - centre.y * 0.3, s: 0.3 };
    for (const level of ['system', 'star'] as const) {
      const goal = zoomGoal({ ...scene, camera }, level, null);
      expect(goal.s).toBeGreaterThan(skyFit(scene).s);
      const p = toScreen(centre, goal);
      expect(p.x).toBeCloseTo(600);
      expect(p.y).toBeCloseTo(400);
    }
  });

  it('frames only what the filter leaves visible at sky zoom', () => {
    const hidden = new Set(sky.systems.map((s) => s.id).filter((id) => id !== '586'));
    const all = zoomGoal(scene, 'sky', null);
    const filtered = testScene(sky, layout, {
      camera: scene.camera,
      viewport,
      hidden: new Set([...hidden, 'loose']),
    });
    const one = zoomGoal(filtered, 'sky', null);
    expect(one.s).toBeGreaterThanOrEqual(all.s);
    expect(inView(at('587'), one)).toBe(true);
  });
});
