/** Adapted from rengwu/wayfinder-maps `draw.js` (MIT). See NOTICE. */
import type { Dependency } from '@contract/sky';
import { type Curve, edgeCurve, pointOn, tangentOn } from '@app/sky/engine/curve';
import type { Point } from '@app/sky/engine/types';
import { disc, type Frame, lineScale, mod, seedOf, TAU } from './frame';
import { rgba } from './palette';

export interface EdgeLook {
  /** Scales every alpha. */
  dim: number;
  selected: boolean;
  /** The blocked end is a System, so the portal ring opens wide around its core. */
  ontoSystem: boolean;
}

/** One Dependency from blocker `a` to blocked `b`, in world space. */
export function drawDependency(f: Frame, dep: Dependency, a: Point, b: Point, look: EdgeLook) {
  const { dim } = look;
  const curve = edgeCurve(a, b, dep.kind === 'hyperlane');
  const k = lineScale(f.s);
  if (look.selected) {
    f.ctx.strokeStyle = rgba(f.palette.ink, 0.28);
    f.ctx.lineWidth = 7 * k;
    stroke(f.ctx, curve);
  }
  const seed = seedOf(dep.blocker) * 0.13 + seedOf(dep.blocked) * 0.05;
  if (dep.satisfied) drawSatisfied(f, curve, dim, k, seed);
  else if (dep.kind === 'hyperlane') drawWarp(f, dep, curve, look, k, seed);
  else drawLane(f, dep.hot, curve, dim, k, seed);
}

function stroke(ctx: CanvasRenderingContext2D, c: Curve): void {
  ctx.beginPath();
  ctx.moveTo(c.a.x, c.a.y);
  ctx.quadraticCurveTo(c.c.x, c.c.y, c.b.x, c.b.y);
  ctx.stroke();
}

function drawSatisfied(f: Frame, c: Curve, dim: number, k: number, seed: number): void {
  const { ctx } = f;
  const satisfied = f.palette.satisfied;
  ctx.strokeStyle = rgba(satisfied.line, 0.6 * dim);
  ctx.lineWidth = 1.5 * k;
  ctx.setLineDash([2 * k, 4 * k]);
  stroke(ctx, c);
  ctx.setLineDash([]);
  for (let i = 0; i < 2; i++) {
    const u = mod(f.t * 0.12 + i / 2 + seed, 1);
    const p = pointOn(c, u);
    ctx.fillStyle = rgba(satisfied.spark, (0.15 + 0.6 * Math.sin(u * Math.PI)) * dim);
    disc(ctx, p.x, p.y, 1.8 * k);
    ctx.fill();
  }
}

function drawWarp(f: Frame, dep: Dependency, c: Curve, look: EdgeLook, k: number, seed: number) {
  const { ctx, t } = f;
  const { dim } = look;
  const hyperlane = f.palette.hyperlane;
  const big = dep.systemToSystem ? 1.6 : 1;
  ctx.lineCap = 'round';
  for (const [colour, alpha, width, isGlow] of [
    [hyperlane.haze, 0.08, 12, true],
    [hyperlane.beam, 0.16, 4.5, false],
    [hyperlane.core, 0.7, 1, false],
  ] as const) {
    if (isGlow && !f.palette.glows) continue;
    ctx.strokeStyle = rgba(colour, alpha * dim);
    ctx.lineWidth = width * k * big;
    stroke(ctx, c);
  }
  ctx.lineCap = 'butt';

  const gap = 34 * k;
  const n = Math.max(1, Math.floor((c.len * 1.05) / gap));
  const shift = mod(t * 0.35, 1);
  ctx.strokeStyle = rgba(hyperlane.chevron, 0.75 * dim);
  ctx.lineWidth = 1.4 * k * big;
  for (let i = 0; i < n; i++) {
    const u = (i + shift) / n;
    if (u < 0.08 || u > 0.92) continue;
    const p = pointOn(c, u);
    const d = tangentOn(c, u);
    const h = 4 * k * big;
    const w = 3.4 * k * big;
    ctx.globalAlpha = Math.sin(u * Math.PI);
    ctx.beginPath();
    ctx.moveTo(p.x - d.x * h - d.y * w, p.y - d.y * h + d.x * w);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x - d.x * h + d.y * w, p.y - d.y * h - d.x * w);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const head = mod(t * 0.16 + seed * 2.8, 1.6);
  if (head < 1) {
    for (let j = 0; j < 12; j++) {
      const u = head - j * 0.012;
      if (u < 0) break;
      const p = pointOn(c, u);
      const alpha = (1 - j / 12) * Math.sin(head * Math.PI);
      ctx.fillStyle = rgba(j ? hyperlane.comet : hyperlane.cometHead, alpha * dim);
      disc(ctx, p.x, p.y, (j ? 2.2 - j * 0.12 : 2.8) * k * big);
      ctx.fill();
    }
  }

  const pr = (look.ontoSystem ? 22 : 13) * k;
  const spin = t * 0.9;
  ctx.strokeStyle = rgba(hyperlane.portal, (0.45 + 0.2 * Math.sin(t * 2 + seed)) * dim);
  ctx.lineWidth = 1.3 * k;
  for (let q = 0; q < 3; q++) {
    ctx.beginPath();
    ctx.arc(c.b.x, c.b.y, pr, spin + (q * TAU) / 3, spin + (q * TAU) / 3 + 1.2);
    ctx.stroke();
  }
}

function drawLane(f: Frame, hot: boolean, c: Curve, dim: number, k: number, seed: number) {
  const { ctx, t } = f;
  const lane = f.palette.lane;
  const steps = 18;
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const p = pointOn(c, u);
    const d = tangentOn(c, u);
    const w = ((2.6 - 2 * u) * k) / 2;
    left.push({ x: p.x - d.y * w, y: p.y + d.x * w });
    right.push({ x: p.x + d.y * w, y: p.y - d.x * w });
  }
  if (hot && f.palette.glows) {
    ctx.strokeStyle = rgba(lane.hotGlow, 0.16 * dim);
    ctx.lineWidth = 6 * k;
    ctx.lineCap = 'round';
    stroke(ctx, c);
    ctx.lineCap = 'butt';
  }
  ctx.fillStyle = hot ? rgba(lane.hotThread, 0.6 * dim) : rgba(lane.thread, 0.38 * dim);
  ctx.beginPath();
  ctx.moveTo(left[0]!.x, left[0]!.y);
  for (const p of left) ctx.lineTo(p.x, p.y);
  for (const p of right.reverse()) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fill();
  const phase = mod(t * (hot ? 0.45 : 0.25) + seed, 1.8) - 0.3;
  for (const u of [0.22, 0.4, 0.58, 0.76]) {
    const p = pointOn(c, u);
    const shine = Math.max(0, 1 - Math.abs(u - phase) * 6);
    ctx.fillStyle = hot
      ? rgba(lane.hotBead, (0.35 + 0.65 * shine) * dim)
      : rgba(lane.bead, (0.22 + 0.6 * shine) * dim);
    disc(ctx, p.x, p.y, (1.3 + 1.1 * shine) * k);
    ctx.fill();
  }
}
