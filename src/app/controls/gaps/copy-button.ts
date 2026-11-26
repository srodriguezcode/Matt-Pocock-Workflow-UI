import { Component, inject, input, signal } from '@angular/core';
import { copyText } from '@app/controls/clipboard';
import { I18nService } from '@app/i18n/i18n.service';

@Component({
  selector: 'app-copy-button',
  templateUrl: './copy-button.html',
  styleUrl: './copy-button.scss',
})
export class CopyButton {
  readonly text = input.required<string>();
  protected readonly i18n = inject(I18nService);
  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    if (!(await copyText(this.text()))) return;
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }
}
