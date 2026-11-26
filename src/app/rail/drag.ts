import { signal } from '@angular/core';

/** Pointer travel in px before a press turns into a drag. Less stays a click. */
export const DRAG_THRESHOLD = 5;

/** A press on a Rail tile. `pitch` is the px from one tile's top to the next. */
export interface Drag {
  from: number;
  count: number;
  pitch: number;
  startY: number;
  dy: number;
  dragging: boolean;
}

export function press(from: number, count: number, pitch: number, y: number): Drag {
  return { from, count, pitch, startY: y, dy: 0, dragging: false };
}

/** Once past the threshold the press stays a drag, even back at its start. */
export function move(drag: Drag, y: number): Drag {
  const dy = y - drag.startY;
  return { ...drag, dy, dragging: drag.dragging || Math.abs(dy) >= DRAG_THRESHOLD };
}

export function dropIndex(drag: Drag): number {
  const to = drag.from + Math.round(drag.dy / drag.pitch);
  return Math.max(0, Math.min(to, drag.count - 1));
}

/** The px a tile moves along the Rail: the pointer's travel for the dragged one, a pitch for the gap. */
export function offset(drag: Drag, index: number): number {
  if (!drag.dragging) return 0;
  if (index === drag.from) return drag.dy;
  const to = dropIndex(drag);
  if (drag.from < index && index <= to) return -drag.pitch;
  if (to <= index && index < drag.from) return drag.pitch;
  return 0;
}

export interface Move {
  from: number;
  to: number;
}

/** The move a release makes, or `null` for a click, a release off the Rail, or no change. */
export function drop(drag: Drag, onRail: boolean): Move | null {
  if (!drag.dragging || !onRail) return null;
  const to = dropIndex(drag);
  return to === drag.from ? null : { from: drag.from, to };
}

export function moved<T>(items: readonly T[], { from, to }: Move): T[] {
  const next = [...items];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

export function inside(
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  x: number,
  y: number,
) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** One press on the Rail at a time, from pointer down to release or cancel. */
export class TileDrag {
  readonly current = signal<Drag | null>(null);
  /** The browser still fires a click on the tile after a drag ends on it. */
  private clickAfterDrag = false;

  press(from: number, count: number, pitch: number, y: number): void {
    this.clickAfterDrag = false;
    this.current.set(press(from, count, pitch, y));
  }

  move(y: number): void {
    const drag = this.current();
    if (drag) this.current.set(move(drag, y));
  }

  release(onRail: boolean): Move | null {
    const drag = this.end();
    return drag ? drop(drag, onRail) : null;
  }

  cancel(): void {
    this.end();
  }

  /** False for the click that ends a drag. A keyboard click, with `detail` 0, always selects. */
  selects(click: Pick<MouseEvent, 'detail'>): boolean {
    const swallowed = this.clickAfterDrag && click.detail > 0;
    this.clickAfterDrag = false;
    return !swallowed;
  }

  /** `null` rather than a zero shift: any transform traps the tile tip under the stage. */
  transform(index: number): string | null {
    const drag = this.current();
    const dy = drag ? offset(drag, index) : 0;
    return dy ? `translateY(${dy}px)` : null;
  }

  lifted(index: number): boolean {
    const drag = this.current();
    return !!drag?.dragging && drag.from === index;
  }

  private end(): Drag | null {
    const drag = this.current();
    this.current.set(null);
    if (drag) this.clickAfterDrag = drag.dragging;
    return drag;
  }
}
