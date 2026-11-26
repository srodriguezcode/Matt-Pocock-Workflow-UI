import { Component, inject, input, output } from '@angular/core';
import type { Gap } from '@contract/gap';
import { GapList } from '@app/controls/gaps/gap-list';
import { NewSession } from '@app/controls/new-session';
import { I18nService } from '@app/i18n/i18n.service';

/**
 * Stage centre for a repo with no sky. `fatal` set shows why the active repo has none.
 * Left `null`, it shows the machine Gaps and lets the caller offer Add repo.
 */
@Component({
  selector: 'app-empty-board',
  imports: [GapList, NewSession],
  templateUrl: './empty-board.html',
  styleUrl: './empty-board.scss',
})
export class EmptyBoard {
  readonly gaps = input<Gap[]>([]);
  readonly fatal = input<Gap | null>(null);
  readonly add = output<void>();
  protected readonly i18n = inject(I18nService);
}
