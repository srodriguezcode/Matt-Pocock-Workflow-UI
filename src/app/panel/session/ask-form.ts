import { Component, computed, inject, input } from '@angular/core';
import type { AskQuestion, SessionView } from '@contract/session';
import { I18nService } from '@app/i18n/i18n.service';
import { injectAnswerDeps } from './answer-deps';
import { askKind, pickOption, typeOther, type AskField } from './answers';
import { heldAnswer } from './held-answer';

@Component({
  selector: 'app-ask-form',
  templateUrl: './ask-form.html',
  styleUrl: './ask-form.scss',
})
export class AskForm {
  protected readonly i18n = inject(I18nService);
  readonly session = input.required<SessionView>();
  protected readonly answer = heldAnswer(injectAnswerDeps(), this.session, askKind);
  protected readonly questions = computed(() => this.answer.question()?.questions ?? []);

  protected checked(index: number, label: string): boolean {
    return this.answer.value()[index]!.selected.includes(label);
  }

  protected pick(index: number, question: AskQuestion, label: string): void {
    this.update(index, (field) => pickOption(field, label, question.multiSelect));
  }

  protected type(index: number, question: AskQuestion, text: string): void {
    this.update(index, (field) => typeOther(field, text, question.multiSelect));
  }

  private update(index: number, change: (field: AskField) => AskField): void {
    this.answer.edit(this.answer.value().map((field, i) => (i === index ? change(field) : field)));
  }
}
