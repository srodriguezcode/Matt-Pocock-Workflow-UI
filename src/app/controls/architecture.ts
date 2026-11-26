import { Component, computed, inject } from '@angular/core';
import { I18nService } from '@app/i18n/i18n.service';
import { word } from '@app/i18n/word';
import { ARCHITECTURE, Start } from '@app/start/start';

@Component({
  selector: 'app-architecture',
  templateUrl: './architecture/architecture.html',
  styleUrl: './architecture/architecture.scss',
})
export class Architecture {
  private readonly start = inject(Start);
  protected readonly i18n = inject(I18nService);

  protected readonly option = computed(() => this.start.optionFor(ARCHITECTURE));
  protected readonly open = computed(() => this.start.sheet() === ARCHITECTURE);
  protected readonly label = computed(() =>
    this.i18n.messages().board.codes.startLabels.architecture({ code: 'architecture' }),
  );
  protected readonly tooltip = computed(() => {
    const option = this.option();
    const messages = this.i18n.messages().board;
    if (!option || option.enabled) return messages.architecture.tooltip;
    return word(messages.codes.startReasons, option.reason);
  });

  protected toggle(): void {
    if (this.start.opens(ARCHITECTURE)) this.start.toggle(ARCHITECTURE);
  }
}
