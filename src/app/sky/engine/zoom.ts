import { centreOn, fitCamera, STAR_FROM, STAR_SCALE, SYSTEM_FROM, zoomAround } from './camera';
import { toWorld } from './geometry';
import type { RoutedSky } from './route';
import type { Camera, Point, Scene, Selection, ZoomLevel } from './types';
import { LOOSE } from './types';

/** Screen px around the sky fit, room for the outermost labels. */
const SKY_PAD = 40;
const DISC_PAD = 20;
const LINKED_PAD = 160;
const SYSTEM_SCALE = 0.8;

export function skyFit(scene: Scene): Camera {
  const { layout, viewport, shown } = scene;
  const points = [...layout.stars.keys()]
    .filter(shown.star)
    .map(scene.where)
    .filter((p): p is Point => !!p);
  if (shown.fog) points.push(...layout.fog);
  for (const d of layout.discs) if (shown.area(d.systemId)) points.push(...square(d, d.r));
  if (layout.looseRing !== null && shown.area(LOOSE)) {
    points.push(...square({ x: 0, y: 0 }, layout.looseRing));
  }
  const tight = fitCamera(points, viewport, 0);
  return fitCamera(points, viewport, SKY_PAD / tight.s);
}

function square(c: Point, r: number): Point[] {
  return [
    { x: c.x - r, y: c.y - r },
    { x: c.x + r, y: c.y + r },
  ];
}

export function framedStar(sky: RoutedSky, selection: Selection): string | null {
  if (!selection) return null;
  if (selection.kind === 'star') return selection.id;
  if (selection.kind === 'fog') return sky.mapId;
  return sky.dependencies.find((d) => d.id === selection.id)?.blocked ?? null;
}

export function zoomGoal(scene: Scene, level: ZoomLevel, target: string | null): Camera {
  const { sky, layout, viewport } = scene;
  const fit = skyFit(scene);
  if (level === 'sky') return fit;
  const centre = toWorld({ x: viewport.w / 2, y: viewport.h / 2 }, scene.camera);
  const at = target ? scene.where(target) : null;
  if (level === 'star') return centreOn(at ?? centre, viewport, Math.max(STAR_SCALE, fit.s));
  if (!target || !at) return centreOn(centre, viewport, Math.max(SYSTEM_SCALE, fit.s));

  const systemId = sky.index.get(target)?.home;
  const disc = layout.discs.find((d) => d.systemId === systemId);
  const framed = disc
    ? fitCamera(square(disc, disc.r), viewport, DISC_PAD)
    : fitCamera(linked(scene, target), viewport, LINKED_PAD);
  const s = Math.max(fit.s, Math.min(STAR_FROM - 0.01, Math.max(SYSTEM_FROM, framed.s)));
  return zoomAround(framed, { x: viewport.w / 2, y: viewport.h / 2 }, s / framed.s);
}

function linked(scene: Scene, id: string): Point[] {
  const ids = scene.sky.dependencies.flatMap((dep) =>
    dep.blocker === id ? [dep.blocked] : dep.blocked === id ? [dep.blocker] : [],
  );
  return [id, ...ids].map(scene.where).filter((p): p is Point => !!p);
}
