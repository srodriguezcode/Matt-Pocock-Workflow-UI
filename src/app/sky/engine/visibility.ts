import type { RoutedSky } from './route';
import type { Selection } from './types';

export interface Shown {
  star(id: string): boolean;
  /** False only for a closed child whose route is not the live one. The filter plays no part. */
  onRoute(id: string): boolean;
  /** A System's disc by its id, or the Loose ring by `loose`. */
  area(key: string): boolean;
  fog: boolean;
}

/** The System whose closed route shows for this selection, read or not yet. An Ember never opens one. */
export function routeOf(sky: RoutedSky, selection: Selection): string | null {
  if (selection?.kind === 'star') {
    const star = sky.index.get(selection.id)?.star;
    if (star?.kind === 'closed') return star.system.id;
    if (star?.kind !== 'system') return null;
    return !star.system.closed && star.system.arc.closed > 0 ? star.system.id : null;
  }
  if (selection?.kind === 'line') {
    const dep = sky.dependencies.find((d) => d.id === selection.id);
    return dep ? (routeStar(sky, dep.blocker) ?? routeStar(sky, dep.blocked)) : null;
  }
  return null;
}

/** The System of a closed child drawn only with its route. */
function routeStar(sky: RoutedSky, id: string): string | null {
  const star = sky.index.get(id)?.star;
  return star?.kind === 'closed' ? star.system.id : null;
}

/** `route` is the System whose closed route shows. */
export function shownIn(sky: RoutedSky, hidden: ReadonlySet<string>, route: string | null): Shown {
  const onRoute = (id: string) => (routeStar(sky, id) ?? route) === route;
  return {
    onRoute,
    star: (id) => {
      if (!onRoute(id)) return false;
      const keys = sky.index.get(id)?.keys ?? [];
      return keys.length === 0 || keys.some((key) => !hidden.has(key));
    },
    area: (key) => !hidden.has(key),
    fog: !sky.mapId || !hidden.has(sky.mapId),
  };
}
