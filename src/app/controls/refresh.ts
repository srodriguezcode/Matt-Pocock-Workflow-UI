import { Component, computed, DestroyRef, inject } from '@angular/core';
import { I18nService } from '@app/i18n/i18n.service';
import { Board } from '@app/state/board';
import { RefreshClock } from '@app/state/refresh-clock';
import { BACKOFF_MS } from '@app/state/refresh-schedule';
import { readLabel } from '@app/controls/refresh/label';

@Component({
  selector: 'app-refresh',
  templateUrl: './refresh/refresh.html',
  styleUrl: './refresh/refresh.scss',
})
export class Refresh {
  private readonly board = inject(Board);
  private readonly clock = inject(RefreshClock);
  protected readonly i18n = inject(I18nService);

  protected readonly active = this.board.active;
  protected readonly reading = this.board.reading;
  protected readonly failure = this.board.readFailure;
  protected readonly label = computed(() =>
    readLabel(
      this.i18n.messages().board.refresh,
      this.board.skyResponse()?.readAt ?? null,
      this.failure() !== null,
    ),
  );
  protected readonly retry = computed(() =>
    this.i18n.messages().board.refresh.retryEvery(BACKOFF_MS / 60_000),
  );

  constructor() {
    inject(DestroyRef).onDestroy(this.clock.start());
  }

  protected refresh(): void {
    if (!this.reading()) this.clock.refresh();
  }
}
