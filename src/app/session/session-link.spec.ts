import '@angular/compiler';
import {
  createEnvironmentInjector,
  type EnvironmentInjector,
  Injector,
  provideZonelessChangeDetection,
  ɵINJECTOR_SCOPE,
} from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SessionEvent, SessionView } from '@contract/session';
import { Api } from '@app/api/api';
import { Attention } from './attention';
import { SessionLink } from './session-link';
import { SessionStream } from './session-stream';

class FakeStream {
  opened = 0;
  closed = 0;
  private onEvent: ((event: SessionEvent) => void) | null = null;
  open(onEvent: (event: SessionEvent) => void): () => void {
    this.opened++;
    this.onEvent = onEvent;
    return () => this.closed++;
  }
  emit(event: SessionEvent): void {
    this.onEvent?.(event);
  }
}

function session(id: string, over: Partial<SessionView> = {}): SessionView {
  return {
    sessionId: id,
    repo: '/repo',
    target: { kind: 'ticket', id: '7' },
    state: 'working',
    waiting: null,
    since: '2026-09-30T10:00:00Z',
    startedAt: '2026-09-30T10:00:00Z',
    question: null,
    note: null,
    typeable: false,
    peek: [],
    ...over,
  };
}

describe('SessionLink over a SessionStream', () => {
  let stream: FakeStream;
  let link: SessionLink;
  const states = () => [...link.sessions().values()].map((s) => `${s.sessionId}:${s.state}`);

  beforeEach(() => {
    stream = new FakeStream();
    const injector = createEnvironmentInjector(
      [
        { provide: ɵINJECTOR_SCOPE, useValue: 'root' },
        provideZonelessChangeDetection(),
        { provide: Api, useValue: {} },
        { provide: Attention, useValue: {} },
        { provide: SessionStream, useValue: stream },
      ],
      Injector.create({ providers: [] }) as EnvironmentInjector,
    );
    link = injector.get(SessionLink);
  });

  it('opens the stream once and applies its events', () => {
    link.connect();
    stream.emit({ type: 'snapshot', sessions: [session('a'), session('b')] });
    stream.emit({ type: 'status', session: session('a', { state: 'asking' }) });
    stream.emit({ type: 'drop', sessionId: 'b' });

    expect(stream.opened).toBe(1);
    expect(states()).toEqual(['a:asking']);
  });

  it('takes a later snapshot whole, as a reconnect sends one', () => {
    link.connect();
    stream.emit({ type: 'snapshot', sessions: [session('a'), session('b')] });
    stream.emit({ type: 'snapshot', sessions: [session('c', { state: 'ended' })] });

    expect(states()).toEqual(['c:ended']);
  });

  it('closes the stream when the board lets go of it', () => {
    const close = link.connect();
    close();

    expect(stream.closed).toBe(1);
  });
});
