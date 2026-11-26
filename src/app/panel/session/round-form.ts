import { Component, computed, inject, input } from '@angular/core';
import type { SessionView } from '@contract/session';
import { I18nService } from '@app/i18n/i18n.service';
import { injectAnswerDeps } from './answer-deps';
import { DeliveryToggle } from './delivery-toggle';
import { pickKey, roundKind, typeText, type RoundField } from './answers';
import { heldAnswer } from './held-answer';

@Component({
  selector: 'app-round-form',
  imports: [DeliveryToggle],
  templateUrl: './round-form.html',
  styleUrl: './round-form.scss',
})
export class RoundForm {
  protected readonly i18n = inject(I18nService);
  readonly session = input.required<SessionView>();
  protected readonly answer = heldAnswer(injectAnswerDeps(), this.session, roundKind);
  protected readonly questions = computed(() => this.answer.question()?.questions ?? []);

  protected pick(index: number, key: string): void {
    this.set(index, pickKey(key));
  }

  protected type(index: number, text: string): void {
    this.set(index, typeText(text));
  }

  private set(index: number, field: RoundField): void {
    this.answer.edit(this.answer.value().map((old, i) => (i === index ? field : old)));
  }
}
