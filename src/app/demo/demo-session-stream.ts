import { Injectable } from '@angular/core';
import type { AnswerRequest, AnswerResponse, SessionEvent } from '@contract/session';
import type { SessionStream } from '@app/session/session-stream';
import { ScriptedSession } from './scripted-session';

@Injectable({ providedIn: 'root' })
export class DemoSessionStream implements Pick<SessionStream, 'open'> {
  private readonly session = new ScriptedSession();

  open(onEvent: (event: SessionEvent) => void): () => void {
    return this.session.open(onEvent);
  }

  answer(request: AnswerRequest): Promise<AnswerResponse> {
    return this.session.answer(request);
  }
}
