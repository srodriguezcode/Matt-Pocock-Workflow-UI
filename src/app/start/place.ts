import type { Point, Size } from '@app/sky/engine/types';

/** The part of the stage the pill and sheet may cover, in stage px from its top-left. */
export interface Bounds {
  right: number;
  bottom: number;
}

const EDGE = 10;
/** Keeps the sheet below the top-left controls. */
const SHEET_TOP = 60;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

export function placePill(anchor: Point, pill: Size, bounds: Bounds): Point {
  return {
    x: clamp(anchor.x + 22, EDGE, bounds.right - pill.w - EDGE),
    y: clamp(anchor.y - 13, EDGE, bounds.bottom - pill.h - EDGE),
  };
}

export function placeSheet(anchor: Point, sheet: Size, bounds: Bounds): Point {
  return {
    x: clamp(anchor.x + 22, EDGE, bounds.right - sheet.w - EDGE),
    y: clamp(anchor.y + 21, SHEET_TOP, bounds.bottom - sheet.h - EDGE),
  };
}

export function placeCornerSheet(sheet: Size, bounds: Bounds): Point {
  return placeSheet({ x: bounds.right, y: 0 }, sheet, bounds);
}

export type Rect = Pick<DOMRect, 'left' | 'right' | 'top' | 'width' | 'height'>;

/** Only a side panel narrows the stage. */
export function stageBounds(stage: Rect, panel: Rect | null): Bounds {
  const covered = panel && panel.width > 0 && panel.left < stage.right && panel.top <= stage.top;
  const right = covered ? Math.max(0, panel.left - stage.left) : stage.width;
  return { right, bottom: stage.height };
}

/** `host` sits directly in the stage. The panel may overlay the stage's right side. */
export function measureStage(host: HTMLElement): Bounds | null {
  const stage = host.parentElement;
  if (!stage) return null;
  const panel = document.querySelector('app-panel')?.getBoundingClientRect() ?? null;
  return stageBounds(stage.getBoundingClientRect(), panel);
}
