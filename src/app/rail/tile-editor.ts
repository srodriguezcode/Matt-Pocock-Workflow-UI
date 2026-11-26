import { Component, inject, model } from '@angular/core';
import { I18nService } from '@app/i18n/i18n.service';

@Component({
  selector: 'app-tile-editor',
  templateUrl: './tile-editor.html',
  styleUrls: ['./dialog-form.scss', './tile-editor.scss'],
})
export class TileEditor {
  protected readonly i18n = inject(I18nService);

  readonly letters = model('');
  readonly useImage = model(false);
  readonly image = model<string | null>(null);

  protected onLetters(event: Event): void {
    this.letters.set((event.target as HTMLInputElement).value.toUpperCase().slice(0, 2));
  }

  protected onUseImage(event: Event): void {
    this.useImage.set((event.target as HTMLInputElement).checked);
  }

  protected onImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.image.set(reader.result as string);
    reader.readAsDataURL(file);
  }
}
