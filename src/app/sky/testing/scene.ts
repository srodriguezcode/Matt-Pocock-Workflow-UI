import { positionAt } from '@app/sky/engine/geometry';
import type { RoutedSky } from '@app/sky/engine/route';
import type { Layout, Scene, Selection } from '@app/sky/engine/types';
import { routeOf, shownIn } from '@app/sky/engine/visibility';

export interface SceneOptions extends Partial<Omit<Scene, 'sky' | 'layout' | 'shown'>> {
  hidden?: ReadonlySet<string>;
  /** Only feeds `routeOf`, so it picks the live route and nothing else. */
  selection?: Selection;
}

/** A scene with no tweens running, so every star sits where its layout puts it. */
export function testScene(
  sky: RoutedSky,
  layout: Layout,
  { hidden = new Set(), selection = null, ...over }: SceneOptions = {},
): Scene {
  const t = over.t ?? 0;
  return {
    sky,
    layout,
    camera: { x: 0, y: 0, s: 1 },
    viewport: { w: 1200, h: 800 },
    level: 'sky',
    where: (id) => {
      const star = layout.stars.get(id);
      return star ? positionAt(star, t) : null;
    },
    ...over,
    shown: shownIn(sky, hidden, routeOf(sky, selection)),
    t,
  };
}
