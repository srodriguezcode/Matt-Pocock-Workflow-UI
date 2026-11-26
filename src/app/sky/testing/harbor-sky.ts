import type { ClosedRoute, SkyResponse } from '@contract/api';
import type { StartOption } from '@contract/launch';
import type { ClosedChild, Dependency, Sky } from '@contract/sky';
import { type RoutedSky, withRoute } from '@app/sky/engine/route';
import recorded from './harbor-sky-response.json';

/** Written by `server/sky/client-fixture.spec.ts`. Run it with `-u` to record it again. */
const response = recorded as SkyResponse;

export function harborSky(): Sky {
  return structuredClone(response.sky);
}

export function harborStarts(): Record<string, StartOption> {
  return structuredClone(response.starts);
}

function child(n: number, title: string, gate: ClosedChild['gate']): ClosedChild {
  return {
    id: String(n),
    handle: `#${n}`,
    number: n,
    title,
    url: `https://github.com/ana-reyes/harbor/issues/${n}`,
    path: null,
    labels: [],
    gate,
  };
}

/** Units (#292)'s closed route: #290 Done, then #291 Ruled out and #289 Done behind it. */
export function unitsRoute(): ClosedRoute {
  const children = [
    child(290, 'Units: the research', 'done'),
    child(291, 'Units: a per-page toggle', 'ruled-out'),
    child(289, 'Units: the unit check', 'done'),
  ];
  const lane = (blocker: string, blocked: string): Dependency => ({
    id: `${blocker}->${blocked}`,
    blocker,
    blocked,
    kind: 'lane',
    systemToSystem: false,
    satisfied: true,
    hot: false,
  });
  return { systemId: '292', children, lanes: [lane('290', '291'), lane('290', '289')] };
}

export function withClosedArc(sky: Sky): Sky {
  const systems = sky.systems.map((s) =>
    s.id === '292' ? { ...s, arc: { closed: 3, total: s.arc.total + 3 } } : s,
  );
  return { ...sky, systems };
}

export function withClosedRoute(sky: Sky): RoutedSky {
  return withRoute(withClosedArc(sky), unitsRoute());
}
