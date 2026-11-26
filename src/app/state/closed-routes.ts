import { effect, inject, Injectable, untracked } from '@angular/core';
import type { ClosedRoute, SkyResponse } from '@contract/api';
import { Api } from '@app/api/api';
import { SkyView } from '@app/sky/sky-view';
import { Board } from './board';

/**
 * Reads the closed route the selection opens, once per Sky read, into `Board.route`.
 * While a new Sky read's route loads, the old one stays up for the same System.
 */
@Injectable({ providedIn: 'root' })
export class ClosedRoutes {
  private readonly api = inject(Api);
  private readonly board = inject(Board);
  private readonly cache = new Map<string, ClosedRoute>();
  private readFor: SkyResponse | null = null;
  private shown: string | null = null;
  private pending: string | null = null;

  constructor() {
    const view = inject(SkyView);
    effect(() => {
      const response = this.board.skyResponse();
      const path = this.board.activePath();
      const systemId = path ? view.closedRoute() : null;
      untracked(() => {
        if (response !== this.readFor) {
          this.readFor = response;
          this.cache.clear();
        }
        void this.show(systemId === null ? null : `${path}\n${systemId}`);
      });
    });
  }

  private async show(key: string | null): Promise<void> {
    const cached = key === null ? null : this.cache.get(key);
    if (key === null || cached || key !== this.shown) this.board.route.set(cached ?? null);
    this.shown = key;
    if (key === null || cached || key === this.pending) return;
    this.pending = key;
    const [path, systemId] = key.split('\n') as [string, string];
    try {
      const route = await this.api.route(path, systemId);
      this.cache.set(key, route);
      if (this.shown === key) this.board.route.set(route);
    } catch {
    } finally {
      if (this.pending === key) this.pending = null;
    }
  }
}
