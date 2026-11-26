import type { LabelRemaps } from '@contract/repo';
import type { RawGraph } from '#server/tracker/tracker.ts';
import { buildDependencies, buildEmbers } from './edges.ts';
import { countFlaggedTickets } from './flagged.ts';
import { frontier, type BuiltSky } from './frontier.ts';
import { parseMapBody } from './map-body.ts';
import { markOldSystems } from './old.ts';
import { shapeOf } from './shape.ts';
import { buildSystems } from './systems.ts';
import { buildTickets } from './tickets.ts';

/** Applies every `GLOSSARY.md` rule to a Tracker's raw graph. Pure. */
export function buildSky(raw: RawGraph, remaps: LabelRemaps, now: Date): BuiltSky {
  const shape = shapeOf(raw, remaps);
  const tickets = buildTickets(shape, raw.viewer, now);
  const systems = countFlaggedTickets(markOldSystems(buildSystems(shape, now), tickets), tickets);
  const map = systems.find((system) => system.kind === 'map' && !system.closed) ?? null;
  const body = parseMapBody(map ? shape.byId.get(map.id)!.body : '');
  return frontier(
    {
      tracker: raw.tracker,
      viewer: raw.viewer,
      mapId: map?.id ?? null,
      systems,
      tickets,
      embers: buildEmbers(shape),
      dependencies: buildDependencies(shape, tickets),
      fog: body.fog,
      destination: body.destination,
      outOfScope: body.outOfScope,
    },
    remaps,
  );
}
