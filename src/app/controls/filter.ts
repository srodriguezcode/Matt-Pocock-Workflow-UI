import { Component, computed, ElementRef, inject } from '@angular/core';
import { I18nService } from '@app/i18n/i18n.service';
import { SkyView } from '@app/sky/sky-view';
import { Popups } from '@app/controls/keys/popups';
import { Board } from '@app/state/board';
import { filterRows, stillShown, toggleAll } from '@app/controls/filter/filter-rows';

@Component({
  selector: 'app-filter',
  templateUrl: './filter/filter.html',
  styleUrl: './filter/filter.scss',
  host: {
    '(document:click)': 'onDocumentClick($event.target)',
  },
})
export class Filter {
  private readonly board = inject(Board);
  private readonly view = inject(SkyView);
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly i18n = inject(I18nService);
  private readonly popups = inject(Popups);
  protected readonly open = computed(() => this.popups.open() === 'filter');
  protected readonly rows = computed(() => {
    const sky = this.board.sky();
    return sky ? filterRows(sky, this.view.hidden(), this.i18n.messages().board.filter) : [];
  });
  protected readonly filtered = computed(() => this.rows().some((r) => !r.shown));
  protected readonly allHidden = computed(() => this.rows().every((r) => !r.shown));

  protected toggle(): void {
    this.popups.toggle('filter');
  }

  protected set(key: string, shown: boolean): void {
    const hidden = new Set(this.view.hidden());
    if (shown) hidden.delete(key);
    else hidden.add(key);
    this.apply(hidden);
  }

  protected toggleAll(): void {
    this.apply(toggleAll(this.rows()));
  }

  private apply(hidden: ReadonlySet<string>): void {
    this.view.hidden.set(hidden);
    const sky = this.board.sky();
    if (sky && !stillShown(sky, this.view.selection(), hidden, this.view.closedRoute()))
      this.view.select(null);
  }

  protected onDocumentClick(target: EventTarget | null): void {
    this.popups.closeOnOutsideClick('filter', this.host.nativeElement, target);
  }
}
