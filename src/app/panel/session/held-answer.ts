import { computed, linkedSignal, signal, untracked } from '@angular/core';
import type {
  AnswerRequest,
  AnswerResponse,
  Delivery,
  SessionQuestion,
  SessionStatus,
} from '@contract/session';
import { ApiFailure } from '@app/api/api';
import { apiFailureText } from '@app/i18n/api-failure';
import type { CodesBundle } from '@app/i18n/translation-bundle.model';
import type { AnswerNotes } from '@app/session/answer-notes';
import { draftKey, type DraftStore } from '@app/session/drafts';
import type { AnswerKind, QuestionOf } from './answers';

export interface AnswerDeps {
  answer(request: AnswerRequest): Promise<AnswerResponse>;
  drafts: DraftStore;
  notes: Pick<AnswerNotes, 'markGone' | 'clear'>;
  codes(): CodesBundle;
}

export type AnsweredSession = Pick<SessionStatus, 'sessionId' | 'question' | 'typeable'>;

export function heldAnswer<K extends SessionQuestion['kind'], V>(
  deps: AnswerDeps,
  session: () => AnsweredSession,
  kind: AnswerKind<K, V>,
) {
  const question = computed(() => {
    const held = session().question;
    return held?.kind === kind.kind ? (held as QuestionOf<K>) : null;
  });
  const key = computed(() => {
    const held = question();
    return held ? draftKey(session().sessionId, held.id) : undefined;
  });

  const value = linkedSignal<string | undefined, V>({
    source: key,
    computation: () =>
      untracked(() => {
        const held = question();
        const draft = held ? deps.drafts.load(session().sessionId, held.id) : undefined;
        return kind.restore(held, draft);
      }),
  });

  const picked = linkedSignal<string | undefined, Delivery>({
    source: key,
    computation: () => 'hook',
  });
  const choosable = computed(() => session().typeable && kind.kind !== 'ask');
  const chosen = computed<Delivery>(() => (choosable() ? picked() : 'hook'));

  const sending = signal(false);
  const error = signal<string | null>(null);
  const ready = computed(() => question() !== null && kind.ready(value()) && !sending());

  function edit(next: V): void {
    value.set(next);
    const held = question();
    if (held) deps.drafts.save(session().sessionId, held.id, next);
  }

  async function send(): Promise<void> {
    const held = question();
    if (!held || !ready()) return;
    const { sessionId } = session();
    sending.set(true);
    error.set(null);
    try {
      const response = await deps.answer(kind.request(sessionId, held, value(), chosen()));
      deps.drafts.clear(sessionId, held.id);
      if (response.code === 'gone') deps.notes.markGone(sessionId);
      else deps.notes.clear(sessionId);
    } catch (failure) {
      error.set(failureText(failure, deps.codes()));
    } finally {
      sending.set(false);
    }
  }

  return {
    question,
    value: value.asReadonly(),
    edit,
    delivery: { picked, choosable, chosen },
    ready,
    sending: sending.asReadonly(),
    error: error.asReadonly(),
    send,
  };
}

function failureText(failure: unknown, codes: CodesBundle): string {
  if (failure instanceof ApiFailure) return apiFailureText(failure.body, codes);
  return failure instanceof Error ? failure.message : String(failure);
}
