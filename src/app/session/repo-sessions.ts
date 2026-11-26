import { computed, inject, Injectable, signal } from '@angular/core';
import { Board } from '@app/state/board';
import { repoSessionsOf, type RepoSession } from './repo-session-list';
import { SessionDialog } from './session-dialog';
import { SessionLink } from './session-link';

/** New sessions show on no star, so one opens straight into its Peek dialog. */
@Injectable({ providedIn: 'root' })
export class RepoSessions {
  private readonly link = inject(SessionLink);
  private readonly board = inject(Board);
  private readonly dialog = inject(SessionDialog);

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

  open(sessionId: string): void {
    this.openedId.set(sessionId);
    this.dialog.open(sessionId);
  }

  close(): void {
    this.openedId.set(null);
  }
}
