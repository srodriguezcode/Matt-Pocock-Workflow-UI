/** Adapted from rengwu/wayfinder-maps `fog.js` (MIT). See NOTICE. */
import type { PlacedFog } from '@app/sky/engine/types';
import { disc, type Frame, glow, lineScale } from './frame';
import { rgba } from './palette';

const RADIUS = 80;

export function drawFog(f: Frame, p: PlacedFog, selected: boolean): void {
  const { ctx, t } = f;
  const fog = f.palette.fog;
  const breath = f.palette.fogDensity * (0.85 + 0.15 * Math.sin(t * 0.8 + p.x * 0.01));
  glow(ctx, p.x, p.y, RADIUS, [
    [0, rgba(fog.inner, 0.2 * breath)],
    [0.5, rgba(fog.mid, 0.08 * breath)],
    [1, rgba(fog.outer, 0)],
  ]);
  for (let i = 0; i < 3; i++) {
    const a = t * 0.05 * (i % 2 ? 1 : -1) + i * 2.1 + p.y * 0.01;
    const px = p.x + Math.cos(a) * 26;
    const py = p.y + Math.sin(a) * 16;
    glow(ctx, px, py, 44 - i * 8, [
      [0, rgba(fog.puff, 0.1 * breath)],
      [1, rgba(fog.puff, 0)],
    ]);
  }
  if (!selected) return;
  const k = Math.max(lineScale(f.s), 0.7);
  ctx.strokeStyle = rgba(fog.ring, 0.7);
  ctx.lineWidth = 1.3 * k;
  ctx.setLineDash([3 * k, 5 * k]);
  ctx.lineDashOffset = -t * 6 * k;
  disc(ctx, p.x, p.y, 30);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}
