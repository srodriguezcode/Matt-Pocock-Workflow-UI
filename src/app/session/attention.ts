import { effect, inject, Injectable } from '@angular/core';
import { I18nService } from '@app/i18n/i18n.service';
import { attentionCount } from './attention-count';
import { Dismissals } from './dismissals';

const ICON_SIZE = 64;

@Injectable({ providedIn: 'root' })
export class Attention {
  private readonly dismissals = inject(Dismissals);
  private readonly i18n = inject(I18nService);
  private readonly baseTitle = document.title;
  private readonly icons = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];
  private readonly originals = this.icons.map((icon) => icon.href);
  private dotted: string | null = null;
  private wantDot = false;

  constructor() {
    effect(() => {
      const count = attentionCount(this.dismissals.unseen());
      const { tabTitle } = this.i18n.messages().board.session;
      document.title = tabTitle(count, this.baseTitle);
      void this.setDot(count > 0);
    });
  }

  private async setDot(on: boolean): Promise<void> {
    this.wantDot = on;
    if (!on) {
      this.icons.forEach((icon, i) => (icon.href = this.originals[i] ?? icon.href));
      return;
    }
    this.dotted ??= await this.draw();
    if (this.dotted && this.wantDot)
      this.icons.forEach((icon) => (icon.href = this.dotted as string));
  }

  private async draw(): Promise<string | null> {
    const source = this.icons.find((icon) => icon.type === 'image/svg+xml') ?? this.icons[0];
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ICON_SIZE;
    const context = canvas.getContext('2d');
    if (!source || !context) return null;
    const image = new Image();
    image.src = source.href;
    try {
      await image.decode();
    } catch {
      return null;
    }
    context.drawImage(image, 0, 0, ICON_SIZE, ICON_SIZE);
    context.fillStyle = '#ef4444';
    context.beginPath();
    context.arc(ICON_SIZE * 0.75, ICON_SIZE * 0.25, ICON_SIZE * 0.22, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL('image/png');
  }
}
