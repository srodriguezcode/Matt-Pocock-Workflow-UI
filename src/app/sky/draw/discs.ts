import type { System } from '@contract/sky';
import type { Disc } from '@app/sky/engine/types';
import { disc, type Frame, glow } from './frame';
import { rgba } from './palette';

export function drawDisc(f: Frame, d: Disc, system: System): void {
  const { ctx } = f;
  const { disc: tints } = f.palette;
  const tint = system.splitFrontier
    ? f.palette.lit.frontier.glow
    : system.kind === 'map'
      ? tints.map
      : system.gated
        ? tints.gated
        : tints.plain;
  glow(ctx, d.x, d.y, d.r, [
    [0, rgba(tint, 0.1)],
    [0.75, rgba(tint, 0.05)],
    [1, rgba(tint, 0)],
  ]);
  ctx.strokeStyle = rgba(tint, 0.14 * f.palette.discEdge);
  ctx.lineWidth = 1 / f.s;
  ctx.setLineDash([2 / f.s, 6 / f.s]);
  disc(ctx, d.x, d.y, d.r);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** The Loose tickets' orbit, drawn just inside the inner row. */
export function drawLooseRing(f: Frame, r: number): void {
  f.ctx.strokeStyle = rgba(f.palette.disc.looseRing, 0.16);
  f.ctx.lineWidth = 1.4 / f.s;
  disc(f.ctx, 0, 0, r - 24);
  f.ctx.stroke();
}
