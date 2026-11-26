import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { SkyView } from '@app/sky/sky-view';
import { Board } from '@app/state/board';
import { repoSessionsOf, type RepoSession } from './repo-session-list';
import { SessionLink } from './session-link';

/** New sessions show on no star, so the panel opens one by its session id instead. */
@Injectable({ providedIn: 'root' })
export class RepoSessions {
  private readonly link = inject(SessionLink);
  private readonly board = inject(Board);
  private readonly view = inject(SkyView);

  readonly list = computed(() =>
    repoSessionsOf(this.link.sessions().values(), this.board.activePath()),
  );
  private readonly openedId = signal<string | null>(null);
  /** Stays open after the session ends, so its last Peek can still be read. */
  readonly opened = computed(() => {
    const id = this.openedId();
    const session = id ? this.link.sessions().get(id) : undefined;
    return session?.target.kind === 'session' && session.repo === this.board.activePath()
      ? (session as RepoSession)
      : null;
  });

  constructor() {
    effect(() => {
      if (this.view.selection() !== null) untracked(() => this.openedId.set(null));
    });
  }

  open(sessionId: string): void {
    this.view.select(null);
    this.openedId.set(sessionId);
  }

  close(): void {
    this.openedId.set(null);
  }
}
