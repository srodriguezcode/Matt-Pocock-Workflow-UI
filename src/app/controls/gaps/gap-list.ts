import { Component, inject, input } from '@angular/core';
import type { Gap } from '@contract/gap';
import { CopyButton } from '@app/controls/gaps/copy-button';
import { fixCommand, fixSkill, tierWord } from '@app/controls/gaps/gap-view';
import { I18nService } from '@app/i18n/i18n.service';
import { word } from '@app/i18n/word';

@Component({
  selector: 'app-gap-list',
  imports: [CopyButton],
  templateUrl: './gap-list.html',
  styleUrl: './gap-list.scss',
})
export class GapList {
  readonly gaps = input<Gap[]>([]);
  protected readonly i18n = inject(I18nService);
  protected readonly word = word;
  protected readonly tierWord = tierWord;
  protected readonly fixCommand = fixCommand;
  protected readonly fixSkill = fixSkill;
}
