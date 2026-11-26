import { effect, inject, Injectable, untracked } from '@angular/core';
import type { IssueDetail } from '@contract/issue';
import { Api } from '@app/api/api';
import { Board } from './board';
import { IssueDetailCache } from './issue-detail-cache';

/**
 * Fetches `/api/issue` through a cache keyed by repo path and issue id, cleared whenever
 * a new Sky read lands (poll, manual refresh, or a release), so an edit shows up within a refresh.
 */
@Injectable({ providedIn: 'root' })
export class IssueDetails {
  private readonly api = inject(Api);
  private readonly cache = new IssueDetailCache();
  private readAt: string | null = null;

  constructor() {
    const board = inject(Board);
    effect(() => {
      const readAt = board.skyResponse()?.readAt ?? null;
      untracked(() => {
        if (readAt === this.readAt) return;
        this.readAt = readAt;
        this.cache.clear();
      });
    });
  }

  fetch(repo: string, id: string): Promise<IssueDetail> {
    return this.cache.get(`${repo}\n${id}`, () => this.api.issue(repo, id));
  }
}
