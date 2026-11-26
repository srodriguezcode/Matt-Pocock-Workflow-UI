import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { I18nService } from '@app/i18n/i18n.service';
import { SessionLink } from '@app/session/session-link';
import { SkyView } from '@app/sky/sky-view';
import { pillFace } from '@app/start/face';
import { measureStage, placePill } from '@app/start/place';
import { Start } from '@app/start/start';

@Component({
  selector: 'app-pill',
  template: `
    @if (shown() && face(); as f) {
      @if (opens()) {
        <button
          #pill
          type="button"
          class="pill"
          [class]="f.tone"
          [attr.aria-expanded]="start.sheet() === id()"
          (click)="toggle()"
        >
          {{ f.text }}
        </button>
      } @else {
        <span #pill class="pill" [class]="f.tone">{{ f.text }}</span>
      }
    }
  `,
  styleUrl: './pill.scss',
})
export class Pill {
  protected readonly start = inject(Start);
  private readonly i18n = inject(I18nService);
  private readonly view = inject(SkyView);
  private readonly link = inject(SessionLink);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly pill = viewChild<ElementRef<HTMLElement>>('pill');

  protected readonly id = computed(() => {
    const selection = this.view.selection();
    return selection?.kind === 'star' ? selection.id : null;
  });
  protected readonly shown = computed(() => this.view.anchor() !== null);
  protected readonly opens = computed(() => {
    const id = this.id();
    return id !== null && this.start.opens(id);
  });
  protected readonly face = computed(() => {
    const id = this.id();
    if (!id) return null;
    const messages = this.i18n.messages().board;
    return pillFace(
      this.start.optionFor(id),
      this.start.claimFor(id),
      this.start.launchFor(id),
      messages.pill,
      messages.codes,
      this.link.at(id),
    );
  });

  constructor() {
    afterRenderEffect(() => {
      this.face();
      const anchor = this.view.anchor();
      const el = this.pill()?.nativeElement;
      const bounds = measureStage(this.host.nativeElement);
      if (!anchor || !el || !bounds) return;
      const at = placePill(anchor, { w: el.offsetWidth, h: el.offsetHeight }, bounds);
      el.style.transform = `translate(${at.x}px, ${at.y}px)`;
    });
  }

  protected toggle(): void {
    const id = this.id();
    if (id) this.start.toggle(id);
  }
}
