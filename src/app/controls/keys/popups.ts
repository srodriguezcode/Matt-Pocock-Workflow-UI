import { Injectable, signal } from '@angular/core';

export type Popup = 'filter' | 'gaps' | 'keys';

/** The one popup open at a time, so Escape closes it before the sheet under it. */
@Injectable({ providedIn: 'root' })
export class Popups {
  readonly open = signal<Popup | null>(null);

  show(popup: Popup): void {
    this.open.set(popup);
  }

  toggle(popup: Popup): void {
    this.open.update((open) => (open === popup ? null : popup));
  }

  close(popup?: Popup): void {
    if (!popup || this.open() === popup) this.open.set(null);
  }

  closeOnOutsideClick(popup: Popup, host: HTMLElement, target: EventTarget | null): void {
    if (this.open() === popup && !(target instanceof Node && host.contains(target))) {
      this.close(popup);
    }
  }
}
