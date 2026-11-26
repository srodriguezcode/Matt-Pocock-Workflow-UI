import { inject, Injectable } from '@angular/core';
import { focusKind, type KeyCommand, keyCommand } from '@app/controls/keys/key-command';
import { Popups } from '@app/controls/keys/popups';
import { toScreen } from '@app/sky/engine/geometry';
import { arrowTarget, type Direction, startableOrder, stepThrough } from '@app/sky/engine/nav';
import { SkyView } from '@app/sky/sky-view';
import { Start } from '@app/start/start';
import { Board } from '@app/state/board';
import { RefreshClock } from '@app/state/refresh-clock';
import { ThemeSwitch } from '@app/theme/theme-switch';

/** The one listener for the board's keys. Release has no key. */
@Injectable({ providedIn: 'root' })
export class Keyboard {
  private readonly board = inject(Board);
  private readonly view = inject(SkyView);
  private readonly start = inject(Start);
  private readonly clock = inject(RefreshClock);
  private readonly popups = inject(Popups);
  private readonly themeSwitch = inject(ThemeSwitch);
  private opener: HTMLElement | null = null;

  listen(): () => void {
    document.addEventListener('keydown', this.onKey);
    return () => document.removeEventListener('keydown', this.onKey);
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing) return;
    const target = event.target instanceof Element ? event.target : null;
    const command = keyCommand(event, focusKind(target), {
      popup: this.popups.open() !== null,
      sheet: this.start.sheet() !== null,
      running: this.start.running(),
      selected: this.view.selection() !== null,
      zoom: this.view.zoom(),
    });
    if (!command) return;
    event.preventDefault();
    this.run(command);
  };

  private run(command: KeyCommand): void {
    switch (command.do) {
      case 'close-popup':
        return this.popups.close();
      case 'hold-sheet':
        return;
      case 'close-sheet':
        return this.closeSheet();
      case 'deselect':
        return this.view.select(null);
      case 'zoom':
        return this.view.zoomTo(command.level);
      case 'step':
        return this.step(command.dir);
      case 'move':
        return this.move(command.direction);
      case 'enter':
        return this.enter();
      case 'refresh':
        if (!this.board.reading()) this.clock.refresh();
        return;
      case 'filter':
        if (this.board.sky()) this.popups.show('filter');
        return;
      case 'keys':
        return this.popups.toggle('keys');
      case 'theme':
        return this.themeSwitch.toggle();
    }
  }

  private selectedStar(): string | null {
    const selection = this.view.selection();
    return selection?.kind === 'star' ? selection.id : null;
  }

  private step(dir: 1 | -1): void {
    const sky = this.board.sky();
    const scene = this.view.scene();
    if (!sky || !scene) return;
    const order = startableOrder(scene, (id) =>
      this.start.opens(id) ? this.start.optionFor(id) : null,
    );
    const next = stepThrough(order, this.selectedStar(), dir);
    if (next) this.view.flyTo(next);
  }

  private move(direction: Direction): void {
    const scene = this.view.scene();
    const id = scene ? arrowTarget(scene, this.selectedStar(), direction) : null;
    if (!scene || !id) return;
    this.view.select({ kind: 'star', id });
    const at = scene.where(id);
    const p = at ? toScreen(at, scene.camera) : null;
    const { w, h } = scene.viewport;
    if (p && (p.x < 0 || p.y < 0 || p.x > w || p.y > h)) this.view.zoomTo(scene.level, id);
  }

  /** At sky zoom a System core zooms in. Deeper, it opens Start like any star, as its pill would. */
  private enter(): void {
    const id = this.selectedStar();
    const sky = this.board.sky();
    if (!id || !sky || this.start.sheet() === id) return;
    if (this.view.zoom() === 'sky' && sky.systems.some((s) => s.id === id)) {
      this.view.zoomTo('system', id);
      return;
    }
    if (!this.start.opens(id)) return;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.start.open(id);
  }

  private closeSheet(): void {
    this.start.close();
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected) opener.focus();
  }
}
