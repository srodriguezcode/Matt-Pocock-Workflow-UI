import type { LabelFont, LabelItem, LabelTone, Measure, PlacedLabel } from '@app/sky/engine/labels';
import { clock } from './frame';
import { type Palette, rgba, type Rgb } from './palette';

function css(font: LabelFont): string {
  const style = `${font.italic ? 'italic ' : ''}${font.bold ? '600 ' : ''}`;
  return `${style}${font.size}px ui-sans-serif, system-ui, sans-serif`;
}

function colour(palette: Palette, tone: LabelTone): Rgb {
  if (tone === 'map' || tone === 'system' || tone === 'ember' || tone === 'fog')
    return palette.label[tone];
  return palette.lit[tone].core;
}

/** Widths are cached per text and font, since every frame measures the same labels. */
export function canvasMeasure(ctx: CanvasRenderingContext2D): Measure {
  const cache = new Map<string, number>();
  return (text, font) => {
    const key = `${css(font)}|${text}`;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = css(font);
      w = ctx.measureText(text).width;
      cache.set(key, w);
    }
    return w;
  };
}

/** Screen space. */
export function drawLabels(
  ctx: CanvasRenderingContext2D,
  labels: PlacedLabel[],
  palette: Palette,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = rgba(palette.labelHalo, 0.9);
  ctx.shadowBlur = 4;
  const ringed = !palette.glows;
  if (ringed) {
    ctx.save();
    ctx.strokeStyle = rgba(palette.labelHalo, 0.9);
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
  }
  for (const { item, x, y } of labels) {
    ctx.font = css(item.font);
    if (ringed) ctx.strokeText(item.text, x, y);
    ctx.fillStyle = rgba(colour(palette, item.tone), item.dim ? 0.3 : 0.95);
    ctx.fillText(item.text, x, y);
  }
  if (ringed) ctx.restore();
  ctx.shadowBlur = 0;
  for (const { item, x, y } of labels) if (item.old) drawOldClock(ctx, item, x, y, palette);
}

/** On its own line under the name, so it never hides the text. */
function drawOldClock(
  ctx: CanvasRenderingContext2D,
  item: LabelItem,
  x: number,
  y: number,
  palette: Palette,
): void {
  const alpha = item.dim ? 0.35 : 1;
  const size = item.font.size;
  clock(
    ctx,
    x,
    y + size * 1.3,
    size * 0.5,
    rgba(palette.mark.old, alpha),
    rgba(palette.sky, alpha),
  );
}
