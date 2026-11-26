import { Injectable } from '@angular/core';
import type { SessionEvent } from '@contract/session';

@Injectable({ providedIn: 'root' })
export class SessionStream {
  /** `EventSource` reconnects on its own, and each reconnect starts with a snapshot. */
  open(onEvent: (event: SessionEvent) => void): () => void {
    const source = new EventSource('/api/session/events');
    source.onmessage = (message: MessageEvent<string>) =>
      onEvent(JSON.parse(message.data) as SessionEvent);
    return () => source.close();
  }
}
