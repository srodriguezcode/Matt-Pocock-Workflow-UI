import type { Dependency, System, Ticket } from '@contract/sky';
import type { Placed } from '@app/session/place';
import { staleClaim } from '@app/session/stale-claim';
import { touched } from './hit';
import { type LabelItem, labelItems, type SkyWords } from './labels';
import { type MarkState, markOf } from './marks';
import type { Disc, PlacedFog, Point, Scene, Selection } from './types';
import { LOOSE } from './types';

const DIM_STAR = 0.25;
const DIM_LINE = 0.15;
/** Alpha of a line whose other end sits in a hidden System. */
const HALF_HIDDEN_LINE = 0.12;

export interface PlannedDisc {
  disc: Disc;
  system: System;
}

export interface PlannedFog {
  patch: PlacedFog;
  selected: boolean;
}

/** `a` is the blocker's world point, `b` the blocked one's. */
export interface PlannedLine {
  dep: Dependency;
  a: Point;
  b: Point;
  alpha: number;
  selected: boolean;
  ontoSystem: boolean;
}

export type PlannedStar = {
  id: string;
  at: Point;
  /** Scales every alpha. */
  dim: number;
  selected: boolean;
  spinning: boolean;
  pulse?: number;
  session: MarkState | null;
} & (
  | { kind: 'system'; system: System }
  | { kind: 'ticket'; ticket: Ticket; stale: boolean }
  | { kind: 'ember' }
  | { kind: 'husk' }
);

/** Painted in field order, so a later item draws over an earlier one. */
export interface FramePlan {
  discs: PlannedDisc[];
  looseRing: number | null;
  fog: PlannedFog[];
  lines: PlannedLine[];
  stars: PlannedStar[];
  labels: LabelItem[];
}

export interface FrameInput {
  selection: Selection;
  spinning: ReadonlySet<string>;
  /** A Star's pulse phase, 0 to 1, while its gate-change ring is out. */
  pulses: ReadonlyMap<string, number>;
  sessions: ReadonlyMap<string, Placed>;
  words: SkyWords;
}

export function framePlan(scene: Scene, input: FrameInput): FramePlan {
  const { sky, layout, shown } = scene;
  const { selection } = input;
  const focus = touched(sky, selection);
  const lit = (id: string) => !focus || focus.has(id);

  const discs: PlannedDisc[] = [];
  for (const disc of layout.discs) {
    const star = sky.index.get(disc.systemId)?.star;
    if (star?.kind === 'system' && shown.area(disc.systemId))
      discs.push({ disc, system: star.system });
  }

  const fog = shown.fog
    ? layout.fog.map((patch) => ({
        patch,
        selected: selection?.kind === 'fog' && selection.id === patch.id,
      }))
    : [];

  const lines: PlannedLine[] = [];
  for (const dep of sky.dependencies) {
    const a = scene.where(dep.blocker);
    const b = scene.where(dep.blocked);
    if (!a || !b) continue;
    if (!shown.onRoute(dep.blocker) || !shown.onRoute(dep.blocked)) continue;
    const ends = [shown.star(dep.blocker), shown.star(dep.blocked)];
    if (!ends[0] && !ends[1]) continue;
    const fade = ends[0] && ends[1] ? 1 : HALF_HIDDEN_LINE;
    lines.push({
      dep,
      a,
      b,
      alpha: fade * (lit(dep.blocker) && lit(dep.blocked) ? 1 : DIM_LINE),
      selected: selection?.kind === 'line' && selection.id === dep.id,
      ontoSystem: sky.index.get(dep.blocked)?.star.kind === 'system',
    });
  }

  const stars: PlannedStar[] = [];
  for (const id of layout.stars.keys()) {
    const star = sky.index.get(id)?.star;
    const at = scene.where(id);
    if (!star || !at || !shown.star(id)) continue;
    const marks = {
      id,
      at,
      dim: lit(id) ? 1 : DIM_STAR,
      selected: selection?.kind === 'star' && selection.id === id,
      spinning: input.spinning.has(id),
      pulse: input.pulses.get(id),
    };
    const placed = input.sessions.get(id);
    if (star.kind === 'system') {
      stars.push({
        ...marks,
        session: markOf(true, placed),
        kind: 'system',
        system: star.system,
      });
    } else if (star.kind === 'ticket') {
      const session = markOf(star.ticket.gate === 'in-flight', placed);
      const stale = staleClaim(star.ticket.claim, placed);
      stars.push({ ...marks, session, kind: 'ticket', ticket: star.ticket, stale });
    } else {
      const { gate } = star.kind === 'ember' ? star.ember : star.child;
      stars.push({ ...marks, session: null, kind: gate === 'ruled-out' ? 'husk' : 'ember' });
    }
  }

  return {
    discs,
    looseRing: layout.looseRing !== null && shown.area(LOOSE) ? layout.looseRing : null,
    fog,
    lines,
    stars,
    labels: labelItems(scene, selection, focus, input.words),
  };
}
