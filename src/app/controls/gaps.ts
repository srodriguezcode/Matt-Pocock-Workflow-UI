import { Component, ElementRef, computed, inject } from '@angular/core';
import { Popups } from '@app/controls/keys/popups';
import { Board } from '@app/state/board';
import { GapList } from '@app/controls/gaps/gap-list';
import { allGaps } from '@app/controls/gaps/gap-view';

@Component({
  selector: 'app-gaps',
  imports: [GapList],
  templateUrl: './gaps.html',
  styleUrl: './gaps.scss',
  host: {
    '(document:click)': 'onDocumentClick($event.target)',
  },
})
export class Gaps {
  private readonly board = inject(Board);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly popups = inject(Popups);
  protected readonly open = computed(() => this.popups.open() === 'gaps');
  protected readonly gaps = computed(() => allGaps(this.board.gaps(), this.board.fatalGap()));

  protected toggle(): void {
    this.popups.toggle('gaps');
  }

  protected onDocumentClick(target: EventTarget | null): void {
    this.popups.closeOnOutsideClick('gaps', this.host.nativeElement, target);
  }
}
