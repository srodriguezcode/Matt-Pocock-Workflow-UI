import { Injectable, signal } from '@angular/core';

/** Asks the panel to open one Session's dialog, e.g. from a notification. */
@Injectable({ providedIn: 'root' })
export class SessionDialog {
  readonly requested = signal<string | null>(null);

  open(sessionId: string): void {
    this.requested.set(sessionId);
  }
}
