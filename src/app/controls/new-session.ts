import { Component, computed, inject, input } from '@angular/core';
import { I18nService } from '@app/i18n/i18n.service';
import { word } from '@app/i18n/word';
import { Board } from '@app/state/board';
import { SESSION, Start } from '@app/start/start';

/**
 * In the corner it shows with the architecture review: a read Sky and no fatal Gap. On the empty
 * board it shows whenever the Tracker is valid, so a failed read still leaves a way in.
 */
@Component({
  selector: 'app-new-session',
  templateUrl: './new-session/new-session.html',
  styleUrl: './new-session/new-session.scss',
})
export class NewSession {
  private readonly start = inject(Start);
  private readonly board = inject(Board);
  protected readonly i18n = inject(I18nService);

  readonly place = input<'corner' | 'empty'>('corner');

  protected readonly option = computed(() => {
    const readable = this.board.sky() !== null && this.board.fatalGap() === null;
    if (this.place() === 'corner' && !readable) return null;
    return this.start.optionFor(SESSION);
  });
  protected readonly open = computed(() => this.start.sheet() === SESSION);
  protected readonly tooltip = computed(() => {
    const option = this.option();
    const messages = this.i18n.messages().board;
    if (!option || option.enabled) return messages.newSession.tooltip;
    return word(messages.codes.startReasons, option.reason);
  });

  protected toggle(): void {
    if (this.start.opens(SESSION)) this.start.toggle(SESSION);
  }
}
