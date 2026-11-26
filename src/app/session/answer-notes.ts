import { Injectable, signal } from '@angular/core';

/** Sessions whose last board answer came back `gone`. The form is gone with its question, so the host shows the note. */
@Injectable({ providedIn: 'root' })
export class AnswerNotes {
  readonly gone = signal<ReadonlySet<string>>(new Set());

  markGone(sessionId: string): void {
    this.gone.update((ids) => new Set(ids).add(sessionId));
  }

  clear(sessionId: string): void {
    this.gone.update((ids) => {
      const next = new Set(ids);
      next.delete(sessionId);
      return next;
    });
  }
}
