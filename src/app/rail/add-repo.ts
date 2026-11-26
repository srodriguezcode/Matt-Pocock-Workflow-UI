import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import type { Tile } from '@contract/repo';
import { Api } from '@app/api/api';
import { I18nService } from '@app/i18n/i18n.service';
import { failureText } from '@app/i18n/failure-text';
import { RuntimeInfo } from '@app/state/runtime';
import { Board } from '@app/state/board';
import { TileEditor } from '@app/rail/tile-editor';
import { folderName, tileLetters } from '@app/rail/tile-letters';

@Component({
  selector: 'app-add-repo',
  imports: [TileEditor],
  templateUrl: './add-repo.html',
  styleUrl: './dialog-form.scss',
})
export class AddRepo {
  private readonly api = inject(Api);
  private readonly board = inject(Board);
  private readonly runtime = inject(RuntimeInfo);
  protected readonly container = this.runtime.container;
  protected readonly loaded = this.runtime.loaded;
  protected readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly path = signal('');
  protected readonly letters = signal('');
  protected readonly useImage = signal(false);
  protected readonly image = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly submitting = signal(false);
  private lettersEdited = false;

  open(): void {
    if (!this.loaded()) void this.runtime.load();
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  reset(): void {
    this.path.set('');
    this.letters.set('');
    this.useImage.set(false);
    this.image.set(null);
    this.error.set(null);
    this.submitting.set(false);
    this.lettersEdited = false;
  }

  protected onPath(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.path.set(value);
    if (!this.lettersEdited) this.letters.set(tileLetters(folderName(value)));
  }

  protected onLetters(letters: string): void {
    this.lettersEdited = true;
    this.letters.set(letters);
  }

  protected async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const image = this.image();
    if (this.useImage() && !image) return;
    const tile: Tile = this.useImage() ? { image: image! } : { letters: this.letters() };
    this.submitting.set(true);
    this.error.set(null);
    try {
      const repo = await this.api.addRepo(
        this.container() ? { github: this.path().trim(), tile } : { path: this.path(), tile },
      );
      await this.board.added(repo);
      this.close();
    } catch (error) {
      this.error.set(failureText(error, this.i18n.messages().board.codes));
    } finally {
      this.submitting.set(false);
    }
  }
}
