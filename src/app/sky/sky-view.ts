import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Board } from '@app/state/board';
import type { Point, Scene, Selection, ZoomLevel } from '@app/sky/engine/types';
import { routeOf } from '@app/sky/engine/visibility';
import { framedStar } from '@app/sky/engine/zoom';

/** Commands the sky component carries out on the engine. */
export interface SkyDriver {
  flyTo(id: string): void;
  /** `id` picks the System or star to frame. `null` zooms about the current centre. */
  zoomTo(level: ZoomLevel, id: string | null): void;
  scene(): Scene | null;
}

/** The sky's state as the rest of the app sees it. The sky component writes it and drives the engine. */
@Injectable({ providedIn: 'root' })
export class SkyView {
  readonly selection = signal<Selection>(null);
  readonly zoom = signal<ZoomLevel>('sky');
  /** Screen position of the selected star inside the stage, updated each frame. */
  readonly anchor = signal<Point | null>(null);
  readonly hidden = signal<ReadonlySet<string>>(new Set());
  /** Stars with a Start running on them. Each gets a spinner. */
  readonly spinning = signal<ReadonlySet<string>>(new Set());

  private readonly board = inject(Board);
  readonly closedRoute = computed(() => {
    const sky = this.board.sky();
    return sky ? routeOf(sky, this.selection()) : null;
  });

  private driver: SkyDriver | null = null;

  constructor() {
    effect(() => {
      this.board.activePath();
      untracked(() => {
        this.selection.set(null);
        this.hidden.set(new Set());
      });
    });
  }

  attach(driver: SkyDriver | null): void {
    this.driver = driver;
  }

  select(selection: Selection): void {
    this.selection.set(selection);
  }

  flyTo(id: string): void {
    this.selection.set({ kind: 'star', id });
    this.driver?.flyTo(id);
  }

  zoomTo(level: ZoomLevel, id?: string): void {
    const sky = this.board.sky();
    this.driver?.zoomTo(level, id ?? (sky && framedStar(sky, this.selection())));
  }

  scene(): Scene | null {
    return this.driver?.scene() ?? null;
  }
}
