import type { TranslationBundle } from '@app/i18n/translation-bundle.model';
import { looseTickets, type RoutedSky } from '@app/sky/engine/route';
import type { Selection } from '@app/sky/engine/types';
import { LOOSE } from '@app/sky/engine/types';
import { shownIn } from '@app/sky/engine/visibility';

export type FilterTone = 'map' | 'gated' | 'system' | 'loose';

export interface FilterRow {
  key: string;
  name: string;
  tone: FilterTone;
  count: number;
  shown: boolean;
}

export function filterRows(
  sky: RoutedSky,
  hidden: ReadonlySet<string>,
  filter: TranslationBundle['board']['filter'],
): FilterRow[] {
  const count = (systemId: string) => sky.tickets.filter((t) => t.systemId === systemId).length;
  const loose = looseTickets(sky);
  const rows: FilterRow[] = sky.systems.map((s) => ({
    key: s.id,
    name: s.name,
    tone: s.kind === 'map' ? 'map' : s.gated ? 'gated' : 'system',
    count: count(s.id),
    shown: !hidden.has(s.id),
  }));
  if (loose.length) {
    rows.push({
      key: LOOSE,
      name: filter.looseTickets,
      tone: 'loose',
      count: loose.length,
      shown: !hidden.has(LOOSE),
    });
  }
  return rows;
}

export function toggleAll(rows: FilterRow[]): Set<string> {
  return rows.every((r) => !r.shown) ? new Set() : new Set(rows.map((r) => r.key));
}

export function stillShown(
  sky: RoutedSky,
  selection: Selection,
  hidden: ReadonlySet<string>,
  route: string | null,
): boolean {
  if (!selection) return true;
  const shown = shownIn(sky, hidden, route);
  if (selection.kind === 'star') return shown.star(selection.id);
  if (selection.kind === 'fog') return shown.fog;
  const dep = sky.dependencies.find((d) => d.id === selection.id);
  return !!dep && shown.star(dep.blocker) && shown.star(dep.blocked);
}
