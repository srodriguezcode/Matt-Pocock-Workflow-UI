import { inject } from '@angular/core';
import { I18nService } from '@app/i18n/i18n.service';
import { AnswerNotes } from '@app/session/answer-notes';
import { Drafts } from '@app/session/drafts';
import { SessionLink } from '@app/session/session-link';
import type { AnswerDeps } from './held-answer';

export function injectAnswerDeps(): AnswerDeps {
  const link = inject(SessionLink);
  const i18n = inject(I18nService);
  return {
    answer: (request) => link.answer(request),
    drafts: inject(Drafts),
    notes: inject(AnswerNotes),
    codes: () => i18n.messages().board.codes,
  };
}
