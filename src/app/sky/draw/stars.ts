/** Adapted from rengwu/wayfinder-maps `draw.js` (MIT). See NOTICE. */
import type { System, Ticket } from '@contract/sky';
import { markRadius, type MarkState, systemShine } from '@app/sky/engine/marks';
import type { Point } from '@app/sky/engine/types';
import { clock, disc, type Frame, glow, seedOf, starScale, TAU } from './frame';
import { rgba } from './palette';
import { drawSessionMark } from './session-mark';
import { drawSparkleCentre, drawSparkleGlow, traceBody, traceEcho } from './sparkle';

/** Alpha of a dimmed star's outline on paper: ink this faint reads as grey. */
const HOLLOW = 0.4;
/** Gap, in star scale, from a Session ring out to the crescent's centre. */
const CRESCENT_CLEAR = 6;

export interface StarMarks {
  /** Scales every alpha. */
  dim: number;
  selected: boolean;
  spinning: boolean;
  /** 0 to 1 through the one-off ring a gate change sends out. */
  pulse?: number;
  session: MarkState | null;
}

export interface TicketMarks extends StarMarks {
  stale: boolean;
}

export function drawTicket(f: Frame, ticket: Ticket, p: Point, marks: TicketMarks): void {
  const { ctx, t } = f;
  const { dim } = marks;
  const k = starScale(f.s);
  const look = f.palette.lit[ticket.light];
  const frontier = ticket.light === 'frontier';
  const beat = 0.5 + 0.5 * Math.sin(t * 2.8 + seedOf(ticket.id));
  const pulse = frontier ? 0.8 + 0.2 * beat : 1;
  const r = look.r * k;
  const { flagged } = ticket;
  const mr = markRadius(r, r, flagged ? 'flagged' : null);
  if (hollow(f, p, r, dim, flagged)) {
    drawMarks(f, p, mr, 9, marks);
    return;
  }
  if (f.palette.glows) {
    const gr = look.gr * k * (frontier ? 0.92 + 0.16 * beat : 1);
    glow(ctx, p.x, p.y, gr, [
      [0, rgba(look.glow, 0.8 * pulse * dim)],
      [0.4, rgba(look.glow, 0.2 * pulse * dim)],
      [1, rgba(look.glow, 0)],
    ]);
  }
  if (flagged) drawSparkleGlow(f, p, r, look.core, dim);
  if (ticket.light === 'undecided') {
    ctx.strokeStyle = rgba(look.core, 0.9 * dim);
    ctx.lineWidth = 1.5 * k;
    traceBody(f, p, r, flagged);
    ctx.stroke();
    ctx.fillStyle = rgba(look.core, 0.8 * dim);
    disc(ctx, p.x, p.y, 1.2 * k);
    ctx.fill();
  } else {
    ctx.fillStyle = rgba(look.core, dim);
    traceBody(f, p, r, flagged);
    ctx.fill();
    if (flagged) drawSparkleCentre(f, p, r, dim);
    /** On paper this ring stands in for the dropped glow, and carries the Frontier's beat. */
    if (!f.palette.glows) {
      ctx.strokeStyle = rgba(look.core, 0.5 * pulse);
      ctx.lineWidth = 0.8 * k;
      disc(ctx, p.x, p.y, mr + (frontier ? 1.5 + 1.5 * beat : 2) * k);
      ctx.stroke();
    }
  }
  if (ticket.light === 'in-flight') {
    ctx.strokeStyle = rgba(look.core, 0.5 * dim);
    ctx.lineWidth = 1.2 * k;
    disc(ctx, p.x, p.y, mr + 5 * k);
    ctx.stroke();
  }
  const ring = mr + 13 * k;
  if (marks.stale) drawCrescent(f, p, mr, marks.session ? ring : null, k, dim);
  if (ticket.old) drawOldClock(f, p, mr, k, dim);
  if (marks.session) drawSessionMark(f, p, ticket.id, ring, marks.session, dim);
  drawMarks(f, p, mr, 9, marks);
}

export function drawEmber(f: Frame, id: string, p: Point, marks: StarMarks, size = 1): void {
  const { ctx, t } = f;
  const { dim } = marks;
  const k = starScale(f.s) * size;
  const seed = seedOf(id);
  const { emberLook, ember } = f.palette;
  const flicker = 0.7 + 0.18 * Math.sin(t * 1.7 + seed * 3) + 0.12 * Math.sin(t * 4.3 + seed);
  const r = emberLook.r * k;
  if (hollow(f, p, r, dim)) {
    drawMarks(f, p, r, 9, marks);
    return;
  }
  if (f.palette.glows) {
    const gr = emberLook.gr * k * (0.9 + 0.2 * flicker);
    glow(ctx, p.x, p.y, gr, [
      [0, rgba(emberLook.glow, 0.75 * flicker * dim)],
      [0.45, rgba(emberLook.glow, 0.18 * flicker * dim)],
      [1, rgba(emberLook.glow, 0)],
    ]);
  }
  ctx.fillStyle = rgba(ember.crust, dim);
  disc(ctx, p.x, p.y, r);
  ctx.fill();
  ctx.strokeStyle = rgba(emberLook.core, 0.9 * flicker * dim);
  ctx.lineWidth = 1.4 * k;
  ctx.stroke();
  ctx.fillStyle = rgba(ember.heart, flicker * dim);
  disc(ctx, p.x, p.y, r * 0.38);
  ctx.fill();
  drawMarks(f, p, r, 9, marks);
}

/** A Ruled out ticket: an Ember's size and crust, cold, with no glow. */
export function drawHusk(f: Frame, p: Point, marks: StarMarks): void {
  const { ctx } = f;
  const { dim } = marks;
  const { emberLook, husk } = f.palette;
  const k = starScale(f.s);
  const r = emberLook.r * k;
  if (hollow(f, p, r, dim)) {
    drawMarks(f, p, r, 9, marks);
    return;
  }
  ctx.fillStyle = rgba(husk.crust, 0.85 * dim);
  disc(ctx, p.x, p.y, r);
  ctx.fill();
  ctx.strokeStyle = rgba(husk.rim, 0.6 * dim);
  ctx.lineWidth = 1.2 * k;
  ctx.stroke();
  drawMarks(f, p, r, 9, marks);
}

/** A System's core, with its closed / total arc. A closed System burns as a large coal. */
export function drawSystem(f: Frame, system: System, p: Point, marks: StarMarks): void {
  const { ctx } = f;
  const { dim } = marks;
  const k = starScale(f.s);
  const map = system.kind === 'map';
  const colours = f.palette.system;
  const lit = system.splitFrontier ? f.palette.lit.frontier : null;
  const beat = 0.5 + 0.5 * Math.sin(f.t * 2.8 + seedOf(system.id));
  const r = (map ? 15 : 11) * k;
  const shine = systemShine(system);
  const mr = markRadius(r, r * 0.8, shine);
  if (hollow(f, p, r * 0.8, dim, shine === 'flagged')) {
    if (shine === 'echo') {
      traceEcho(f, p, r);
      ctx.stroke();
    }
    drawMarks(f, p, mr, 16, marks);
    return;
  }
  if (system.closed) {
    drawEmber(f, system.id, p, { ...marks, selected: false, pulse: undefined }, 1.8);
  } else {
    const glowColour =
      lit?.glow ?? (map ? colours.mapGlow : system.gated ? colours.gatedGlow : colours.glow);
    const core =
      lit?.core ??
      (map ? colours.mapCore : system.state === 'spent' ? colours.spentCore : colours.core);
    if (f.palette.glows) {
      const lift = lit ? 0.8 + 0.2 * beat : 1;
      glow(ctx, p.x, p.y, r * 4 * (lit ? 0.92 + 0.16 * beat : 1), [
        [0, rgba(glowColour, 0.55 * lift * dim)],
        [1, rgba(glowColour, 0)],
      ]);
    }
    const flagged = shine === 'flagged';
    if (flagged) drawSparkleGlow(f, p, r * 0.8, core, dim);
    traceBody(f, p, r * 0.8, flagged);
    if (system.state === 'needs-tickets') {
      ctx.strokeStyle = rgba(core, 0.9 * dim);
      ctx.lineWidth = 2 * k;
      ctx.stroke();
    } else {
      ctx.fillStyle = rgba(core, dim);
      ctx.fill();
      if (flagged) drawSparkleCentre(f, p, r * 0.8, dim);
    }
    if (shine === 'echo') {
      ctx.strokeStyle = rgba(core, 0.8 * dim);
      ctx.lineWidth = 1.2 * k;
      traceEcho(f, p, r);
      ctx.stroke();
    }
  }
  if (system.gated) {
    ctx.strokeStyle = rgba(colours.gatedRing, 0.8 * dim);
    ctx.lineWidth = 1.6 * k;
    ctx.setLineDash([4 * k, 3 * k]);
    disc(ctx, p.x, p.y, r + 4 * k);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const { closed, total } = system.arc;
  if (total > 0) {
    const rr = r + 8 * k;
    ctx.lineWidth = 3 * k;
    ctx.strokeStyle = rgba(colours.arcTrack, dim);
    disc(ctx, p.x, p.y, rr);
    ctx.stroke();
    ctx.strokeStyle = rgba(colours.arcDone, 0.85 * dim);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, -Math.PI / 2, -Math.PI / 2 + (closed / total) * TAU);
    ctx.stroke();
  }
  if (marks.session) drawSessionMark(f, p, system.id, mr + 20 * k, marks.session, dim);
  drawMarks(f, p, mr, 16, marks);
}

/** On paper a dimmed star is a hollow ring, since a faded fill would read as a paler state. */
function hollow(f: Frame, p: Point, r: number, dim: number, flagged = false): boolean {
  if (f.palette.glows || dim >= 1) return false;
  f.ctx.strokeStyle = rgba(f.palette.ink, HOLLOW);
  f.ctx.lineWidth = starScale(f.s);
  traceBody(f, p, r, flagged);
  f.ctx.stroke();
  return true;
}

function drawCrescent(
  f: Frame,
  p: Point,
  r: number,
  sessionRing: number | null,
  k: number,
  dim: number,
) {
  const { ctx, palette } = f;
  const reach = sessionRing === null ? 0 : (sessionRing + CRESCENT_CLEAR * k) / Math.SQRT2;
  const off = Math.max(r + 4 * k, reach);
  const x = p.x + off;
  const y = p.y - off;
  ctx.fillStyle = rgba(palette.mark.stale, 0.9 * dim);
  disc(ctx, x, y, 3.2 * k);
  ctx.fill();
  ctx.fillStyle = rgba(palette.sky, 1);
  disc(ctx, x + 1.6 * k, y - k, 2.8 * k);
  ctx.fill();
}

/** Upper left: the Stale claim crescent holds the upper right, and the label sits below. */
function drawOldClock(f: Frame, p: Point, r: number, k: number, dim: number): void {
  const { ctx, palette } = f;
  const face = rgba(palette.mark.old, 0.95 * dim);
  clock(ctx, p.x - r - 5 * k, p.y - r - 5 * k, 4.5 * k, face, rgba(palette.sky, dim));
}

function drawMarks(f: Frame, p: Point, r: number, halo: number, marks: StarMarks): void {
  const { ctx, palette } = f;
  const k = starScale(f.s);
  if (marks.selected) {
    ctx.strokeStyle = rgba(palette.ink, 0.85);
    ctx.lineWidth = 1.5 * k;
    disc(ctx, p.x, p.y, r + halo * k);
    ctx.stroke();
  }
  if (marks.spinning) {
    const a = f.t * 4;
    ctx.strokeStyle = rgba(palette.mark.spinner, 0.9);
    ctx.lineWidth = 1.6 * k;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 6 * k, a, a + 1.6);
    ctx.stroke();
  }
  if (marks.pulse !== undefined) {
    ctx.strokeStyle = rgba(palette.ink, 0.8 * (1 - marks.pulse));
    ctx.lineWidth = 2 * k;
    disc(ctx, p.x, p.y, r + marks.pulse * 60 * k);
    ctx.stroke();
  }
}
