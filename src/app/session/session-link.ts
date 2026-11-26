import { computed, effect, inject, Injectable, Injector, signal, untracked } from '@angular/core';
import type { AnswerRequest, AnswerResponse, SessionEvent, SessionStatus } from '@contract/session';
import { Api } from '@app/api/api';
import { Board } from '@app/state/board';
import { AnswerNotes } from './answer-notes';
import { Attention } from './attention';
import { Drafts } from './drafts';
import { placeSessions, type Placed } from './place';
import { applyEvent, type Sessions } from './sessions';
import { SessionStream } from './session-stream';
import { recordEnded, triggersReread, visibleSessions, type EndedUnder } from './visibility';

const REREAD_DEBOUNCE_MS = 1500;

/** The board's live line to every linked Session, fed by one SSE stream. */
@Injectable({ providedIn: 'root' })
export class SessionLink {
  private readonly api = inject(Api);
  private readonly board = inject(Board);
  private readonly answerNotes = inject(AnswerNotes);
  private readonly drafts = inject(Drafts);
  private readonly stream = inject(SessionStream);
  private readonly injector = inject(Injector);
  private rereadTimer: ReturnType<typeof setTimeout> | undefined;

  readonly sessions = signal<Sessions>(new Map());
  private readonly endedUnder = signal<EndedUnder>(new Map());
  readonly placed = computed<ReadonlyMap<string, Placed>>(() => {
    const sky = this.board.sky();
    const repo = this.board.activePath();
    if (!sky || !repo) return new Map();
    const mine = [...this.sessions().values()].filter((s) => s.repo === repo);
    return placeSessions(sky, visibleSessions(mine, sky, this.endedUnder()));
  });

  constructor() {
    effect(() => {
      const sky = this.board.sky();
      const repo = this.board.activePath();
      const sessions = this.sessions().values();
      if (!sky || !repo) return;
      const known = untracked(() => this.endedUnder());
      const next = recordEnded(known, sessions, sky, repo);
      if (next !== known) this.endedUnder.set(next);
    });
  }

  connect(): () => void {
    this.injector.get(Attention);
    const close = this.stream.open((event) => this.apply(event));
    return () => {
      close();
      clearTimeout(this.rereadTimer);
    };
  }

  at(starId: string): Placed | null {
    return this.placed().get(starId) ?? null;
  }

  answer(request: AnswerRequest): Promise<AnswerResponse> {
    return this.api.answer(request);
  }

  private apply(event: SessionEvent): void {
    if (event.type === 'status') this.onStatus(event.session);
    this.sessions.update((sessions) => applyEvent(sessions, event));
    this.drafts.prune(this.sessions().values());
  }

  private onStatus(next: SessionStatus): void {
    const known = this.sessions().get(next.sessionId);
    if (next.question && next.question.id !== known?.question?.id) {
      this.answerNotes.clear(next.sessionId);
    }
    if (!triggersReread(known, next)) return;
    clearTimeout(this.rereadTimer);
    this.rereadTimer = setTimeout(
      () => void this.board.readSky({ fresh: true }),
      REREAD_DEBOUNCE_MS,
    );
  }
}
