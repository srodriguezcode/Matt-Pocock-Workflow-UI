import { Component, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { failureText } from '@app/i18n/failure-text';
import { I18nService } from '@app/i18n/i18n.service';
import { Board } from '@app/state/board';
import type { RepoConfig } from '@contract/repo';
import { INSTALL_NOTE } from '@app/install-note/install-note';
import { InstallNoteDialog } from '@app/rail/install-note-dialog';
import { AddRepo } from '@app/rail/add-repo';
import { inside, moved, TileDrag, type Move } from '@app/rail/drag';
import { RepoSettings } from '@app/rail/repo-settings';
import { ThemeSwitch } from '@app/theme/theme-switch';

@Component({
  selector: 'app-rail',
  imports: [AddRepo, InstallNoteDialog, RepoSettings],
  templateUrl: './rail.html',
  styleUrl: './rail.scss',
  host: { '[class.dragging]': 'tileDrag.current()?.dragging' },
})
export class Rail {
  protected readonly board = inject(Board);
  protected readonly i18n = inject(I18nService);
  protected readonly themeSwitch = inject(ThemeSwitch);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly addDialog = viewChild.required(AddRepo);
  private readonly settings = viewChild.required(RepoSettings);
  private readonly noteDialog = viewChild.required(InstallNoteDialog);
  private readonly installNote = inject(INSTALL_NOTE);

  protected readonly tileDrag = new TileDrag();
  protected readonly orderError = signal<string | null>(null);

  openAdd(): void {
    if (this.installNote) this.noteDialog().open();
    else this.addDialog().open();
  }

  protected openSettings(repo: RepoConfig, event?: MouseEvent): void {
    event?.preventDefault();
    this.tileDrag.cancel();
    if (this.installNote) this.noteDialog().open();
    else this.settings().open(repo);
  }

  protected select(path: string, click: MouseEvent): void {
    if (this.tileDrag.selects(click)) void this.board.switchTo(path);
  }

  /** A ctrl-press opens the context menu on macOS, so it starts no drag. */
  protected startDrag(event: PointerEvent, index: number): void {
    if (event.button !== 0 || event.ctrlKey) return;
    const slots = this.host.nativeElement.querySelectorAll('.slot');
    const top = (i: number) => slots[i]!.getBoundingClientRect().top;
    const pitch = slots.length > 1 ? top(1) - top(0) : slots[0]!.getBoundingClientRect().height;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.tileDrag.press(index, slots.length, pitch, event.clientY);
  }

  protected endDrag(event: PointerEvent): void {
    const rail = this.host.nativeElement.getBoundingClientRect();
    const change = this.tileDrag.release(inside(rail, event.clientX, event.clientY));
    if (change) void this.reorder(change);
  }

  @HostListener('document:keydown.escape')
  protected cancelDrag(): void {
    this.tileDrag.cancel();
  }

  private async reorder(change: Move): Promise<void> {
    this.orderError.set(null);
    try {
      await this.board.reorder(
        moved(
          this.board.repos().map((r) => r.path),
          change,
        ),
      );
    } catch (error) {
      this.orderError.set(failureText(error, this.i18n.messages().board.codes));
    }
  }
}
