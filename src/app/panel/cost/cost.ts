import { Component, computed, inject, input, resource } from '@angular/core';
import { Api, ApiFailure } from '@app/api/api';
import { apiFailureText } from '@app/i18n/api-failure';
import { I18nService } from '@app/i18n/i18n.service';
import { Tip } from '@app/controls/tip';
import { Board } from '@app/state/board';
import { costView } from './cost-view';

@Component({
  selector: 'app-cost',
  imports: [Tip],
  templateUrl: './cost.html',
  styleUrl: './cost.scss',
})
export class Cost {
  private readonly api = inject(Api);
  private readonly board = inject(Board);
  protected readonly i18n = inject(I18nService);
  readonly id = input.required<string>();

  protected readonly text = computed(() => this.i18n.messages().board.panel.cost);
  protected readonly reading = resource({
    params: () => {
      const repo = this.board.activePath();
      return repo ? { repo, id: this.id() } : undefined;
    },
    loader: ({ params }) => this.api.cost(params.repo, params.id),
  });
  protected readonly view = computed(() =>
    this.reading.hasValue() ? costView(this.reading.value(), this.text()) : null,
  );
  protected readonly failure = computed(() => {
    const error = this.reading.error();
    if (!error) return null;
    const reason =
      error instanceof ApiFailure
        ? apiFailureText(error.body, this.i18n.messages().board.codes)
        : error.message;
    return this.text().failed(reason);
  });
}
