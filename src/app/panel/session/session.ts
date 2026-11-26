import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { I18nService } from '@app/i18n/i18n.service';
import { AnswerNotes } from '@app/session/answer-notes';
import type { Placed } from '@app/session/place';
import { SessionLink } from '@app/session/session-link';
import { Board } from '@app/state/board';
import { Peek } from './peek';
import { sessionLine } from './session-view';

const TICK_MS = 20_000;

@Component({
  selector: 'app-session',
  imports: [Peek],
  templateUrl: './session.html',
  styleUrl: './session.scss',
})
export class SessionPanel {
  private readonly link = inject(SessionLink);
  private readonly board = inject(Board);
  private readonly answerNotes = inject(AnswerNotes);
  protected readonly i18n = inject(I18nService);
  /** The star the Session shows on. Left `null`, `sessionId` names a new session instead. */
  readonly id = input<string | null>(null);
  readonly sessionId = input<string | null>(null);
  /** A claimed star with no linked Session says so. */
  readonly claimed = input(false);

  private readonly now = signal(Date.now());
  protected readonly placed = computed<Placed | null>(() => {
    const id = this.id();
    if (id !== null) return this.link.at(id);
    const session = this.sessionId() ? this.link.sessions().get(this.sessionId()!) : undefined;
    return session ? { session, sharedFrom: null } : null;
  });
  protected readonly view = computed(() => {
    const placed = this.placed();
    const sky = this.board.sky();
    if (!placed) return null;
    const gone = this.answerNotes.gone().has(placed.session.sessionId);
    return sessionLine(placed, sky, this.now(), gone, this.i18n.messages().board.session);
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
