import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { I18nService } from '@app/i18n/i18n.service';
import { InstallNote } from '@app/install-note/install-note';

@Component({
  selector: 'app-install-note-dialog',
  imports: [InstallNote],
  template: `
    @let m = i18n.messages().board.demo;
    <dialog #dialog>
      <h2>{{ m.dialogTitle }}</h2>
      <app-install-note />
      <div class="actions">
        <button type="button" (click)="close()">{{ m.closeAction }}</button>
      </div>
    </dialog>
  `,
  styleUrl: './dialog-form.scss',
})
export class InstallNoteDialog {
  protected readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }
}
