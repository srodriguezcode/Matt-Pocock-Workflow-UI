import type { Theme } from '@contract/repo';
import type { Dependency, Light, System, Ticket } from '@contract/sky';
import type { MarkState } from '@app/sky/engine/marks';
import type { Point } from '@app/sky/engine/types';
import { drawDisc } from '@app/sky/draw/discs';
import { drawDependency } from '@app/sky/draw/edges';
import { drawFog } from '@app/sky/draw/fog';
import type { Frame } from '@app/sky/draw/frame';
import { PALETTES, rgba } from '@app/sky/draw/palette';
import { drawEmber, drawSystem, drawTicket, type TicketMarks } from '@app/sky/draw/stars';

/** One README legend icon: `span` is the world width it shows, `height` its world height. */
export interface LegendIcon {
  name: string;
  span: number;
  height: number;
  draw: (f: Frame, centre: Point) => void;
}

/** CSS px of every icon's height. The width follows the icon's world aspect. */
const HEIGHT_PX = 64;
const PIXEL_RATIO = 2;
const CORNER_PX = 10;
/** Seconds into the animation. Picked so pulses and rings sit mid-beat. */
const MOMENT = 0.6;

const PLAIN: TicketMarks = {
  dim: 1,
  selected: false,
  spinning: false,
  session: null,
  stale: false,
};

function ticket(light: Light, extra: Partial<Ticket> = {}): Ticket {
  return { id: `legend-${light}`, light, flagged: false, old: false, ...extra } as Ticket;
}

function system(kind: System['kind'], extra: Partial<System> = {}): System {
  return {
    id: `legend-${kind}`,
    kind,
    state: 'live',
    closed: false,
    gated: false,
    splitFrontier: false,
    flagged: false,
    flaggedTickets: 0,
    arc: { closed: 2, total: 5 },
    ...extra,
  } as System;
}

function star(light: Light, extra: Partial<Ticket> = {}): LegendIcon['draw'] {
  return (f, p) => drawTicket(f, ticket(light, extra), p, PLAIN);
}

function core(s: System): LegendIcon['draw'] {
  return (f, p) => drawSystem(f, s, p, { ...PLAIN });
}

const SESSIONS: MarkState[] = ['working', 'asking', 'waiting', 'lost'];

export const LEGEND: LegendIcon[] = [
  {
    name: 'map',
    span: 60,
    height: 60,
    draw: core(system('map', { arc: { closed: 3, total: 7 } })),
  },
  { name: 'spec', span: 50, height: 50, draw: core(system('spec')) },
  {
    name: 'system',
    span: 116,
    height: 116,
    draw: (f, p) => {
      drawDisc(f, { systemId: 'legend-plain', x: p.x, y: p.y, r: 56, fogR: null }, system('plain'));
      drawSystem(f, system('plain'), p, PLAIN);
      for (const [dx, dy] of [
        [-34, -24],
        [36, -14],
        [-12, 38],
        [28, 32],
      ] as const) {
        drawTicket(f, ticket('idle'), { x: p.x + dx, y: p.y + dy }, PLAIN);
      }
    },
  },
  { name: 'ticket', span: 28, height: 28, draw: star('idle') },
  { name: 'frontier', span: 36, height: 36, draw: star('frontier') },
  { name: 'yours', span: 32, height: 32, draw: star('yours') },
  { name: 'decision-frontier', span: 32, height: 32, draw: star('decision-frontier') },
  {
    name: 'split-frontier',
    span: 42,
    height: 42,
    draw: core(
      system('spec', { state: 'needs-tickets', splitFrontier: true, arc: { closed: 0, total: 0 } }),
    ),
  },
  { name: 'blocked', span: 26, height: 26, draw: star('blocked') },
  { name: 'undecided', span: 26, height: 26, draw: star('undecided') },
  { name: 'ember', span: 28, height: 28, draw: (f, p) => drawEmber(f, 'legend-ember', p, PLAIN) },
  {
    name: 'fog',
    span: 150,
    height: 110,
    draw: (f, p) => drawFog(f, { id: 'legend-fog', x: p.x, y: p.y }, false),
  },
  { name: 'gate', span: 50, height: 50, draw: core(system('plain', { gated: true })) },
  {
    name: 'hyperlane',
    span: 164,
    height: 44,
    draw: (f, p) => {
      const a = { x: p.x - 70, y: p.y - 6 };
      const b = { x: p.x + 70, y: p.y - 6 };
      const dep = {
        kind: 'hyperlane',
        systemToSystem: false,
        satisfied: false,
        hot: false,
      } as Dependency;
      drawDependency(f, { ...dep, blocker: 'legend-a', blocked: 'legend-b' }, a, b, {
        dim: 1,
        selected: false,
        ontoSystem: false,
      });
      drawTicket(f, ticket('idle'), a, PLAIN);
      drawTicket(f, ticket('blocked'), b, PLAIN);
    },
  },
  { name: 'old', span: 40, height: 40, draw: star('frontier', { old: true }) },
  { name: 'flagged', span: 40, height: 40, draw: star('frontier', { flagged: true }) },
  {
    name: 'session-state',
    span: 216,
    height: 54,
    draw: (f, p) =>
      SESSIONS.forEach((session, i) => {
        const at = { x: p.x + (i - 1.5) * 54, y: p.y };
        drawTicket(f, ticket('in-flight', { id: `legend-${session}` }), at, { ...PLAIN, session });
      }),
  },
];

/** Draws one icon on a sky-coloured card with rounded corners, and returns it as a PNG data URL. */
export function renderIcon(icon: LegendIcon, theme: Theme): string {
  const palette = PALETTES[theme];
  const zoom = HEIGHT_PX / icon.height;
  const width = Math.round(icon.span * zoom);
  const canvas = document.createElement('canvas');
  canvas.width = width * PIXEL_RATIO;
  canvas.height = HEIGHT_PX * PIXEL_RATIO;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);
  ctx.beginPath();
  ctx.roundRect(0, 0, width, HEIGHT_PX, CORNER_PX);
  ctx.fillStyle = rgba(palette.sky, 1);
  ctx.fill();
  ctx.clip();
  ctx.scale(zoom, zoom);
  icon.draw({ ctx, palette, s: 1, t: MOMENT }, { x: icon.span / 2, y: icon.height / 2 });
  return canvas.toDataURL('image/png');
}
