/** Adapted from rengwu/wayfinder-maps `draw.js` and `util.js` (MIT). See NOTICE. */
import type { Camera, Size } from '@app/sky/engine/types';
import { type Palette, rgba } from './palette';
import { mod } from './frame';

interface Layer {
  /** Share of the camera pan this layer follows. Nearer layers move more. */
  follow: number;
  size: number;
  alpha: number;
  stars: { x: number; y: number; twinkle: number }[];
}

export type Starfield = Layer[];

/** Extra stars come off the generator after the base ones, so density 1 keeps the same field. */
export function createStarfield(density = 1): Starfield {
  const rnd = mulberry32(9001);
  const specs = [
    { follow: 0.15, count: 140, size: 0.7, alpha: 0.45 },
    { follow: 0.3, count: 80, size: 1.1, alpha: 0.65 },
    { follow: 0.5, count: 34, size: 1.7, alpha: 0.9 },
  ];
  const star = () => ({ x: rnd(), y: rnd(), twinkle: rnd() });
  const layers = specs.map(({ count, ...spec }) => ({
    ...spec,
    stars: Array.from({ length: count }, star),
  }));
  specs.forEach(({ count }, i) => {
    const extra = Math.round(count * (density - 1));
    layers[i]!.stars.push(...Array.from({ length: extra }, star));
  });
  return layers;
}

/** Screen space: the backdrop fill and a parallax field that pans slower than the sky. */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  field: Starfield,
  viewport: Size,
  camera: Camera,
  palette: Palette,
): void {
  ctx.fillStyle = rgba(palette.sky, 1);
  ctx.fillRect(0, 0, viewport.w, viewport.h);
  ctx.fillStyle = rgba(palette.ink, 1);
  for (const layer of field) {
    for (const s of layer.stars) {
      ctx.globalAlpha =
        palette.specks * layer.alpha * (0.65 + 0.35 * Math.sin(s.twinkle * Math.PI * 2));
      ctx.fillRect(
        mod(s.x * viewport.w + camera.x * layer.follow, viewport.w),
        mod(s.y * viewport.h + camera.y * layer.follow, viewport.h),
        layer.size,
        layer.size,
      );
    }
  }
  ctx.globalAlpha = 1;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
