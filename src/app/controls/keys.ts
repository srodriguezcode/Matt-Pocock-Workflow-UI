import { Component, computed, DestroyRef, ElementRef, inject } from '@angular/core';
import { Popups } from '@app/controls/keys/popups';
import { I18nService } from '@app/i18n/i18n.service';
import { Keyboard } from '@app/state/keyboard';

@Component({
  selector: 'app-keys',
  templateUrl: './keys/keys.html',
  styleUrl: './keys/keys.scss',
  host: { '(document:click)': 'onDocumentClick($event.target)' },
})
export class Keys {
  private readonly popups = inject(Popups);
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly i18n = inject(I18nService);
  protected readonly open = computed(() => this.popups.open() === 'keys');

  constructor() {
    inject(DestroyRef).onDestroy(inject(Keyboard).listen());
  }

  protected onDocumentClick(target: EventTarget | null): void {
    this.popups.closeOnOutsideClick('keys', this.host.nativeElement, target);
  }
}
