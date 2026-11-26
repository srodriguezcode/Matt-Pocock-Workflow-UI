import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { SystemState } from '@contract/sky';
import { I18nService } from '@app/i18n/i18n.service';
import type { SystemStateNames } from '@app/i18n/translation-name-groups.model';
import { SessionLink } from '@app/session/session-link';
import { Board } from '@app/state/board';
import { ClosedRoutes } from '@app/state/closed-routes';
import { SkyEngine } from '@app/sky/engine/sky-engine';
import type { SkyWords } from '@app/sky/engine/labels';
import { ThemeSwitch } from '@app/theme/theme-switch';
import { SkyView } from './sky-view';

function stateSuffix(states: SystemStateNames, state: SystemState): string {
  return state === 'live' ? '' : ` · ${states[state].toLowerCase()}`;
}

@Component({
  selector: 'app-sky',
  templateUrl: './sky.html',
  styleUrl: './sky.scss',
})
export class Sky {
  private readonly board = inject(Board);
  private readonly view = inject(SkyView);
  private readonly link = inject(SessionLink);
  private readonly i18n = inject(I18nService);
  private readonly themeSwitch = inject(ThemeSwitch);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly engine = signal<SkyEngine | null>(null);
  protected readonly words = computed(() => this.i18n.messages().board.sky);
  private readonly engineWords = computed<SkyWords>(() => {
    const states = this.i18n.messages().board.codes.systemStates;
    return { stateSuffix: (state: SystemState) => stateSuffix(states, state) };
  });

  constructor() {
    inject(ClosedRoutes);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const engine = new SkyEngine(this.canvas().nativeElement, {
        select: (selection) => this.view.select(selection),
        zoom: (level) => this.view.zoom.set(level),
        anchor: (point) => this.view.anchor.set(point),
      });
      this.view.attach({
        flyTo: (id) => engine.flyTo(id),
        zoomTo: (level, id) => engine.zoomTo(level, id),
        scene: () => engine.scene(),
      });
      this.engine.set(engine);
      destroyRef.onDestroy(() => {
        this.view.attach(null);
        engine.destroy();
      });
    });
    effect(() => this.engine()?.setSky(this.board.sky()));
    effect(() => this.engine()?.setSelection(this.view.selection()));
    effect(() => this.engine()?.setRoute(this.view.closedRoute()));
    effect(() => this.engine()?.setHidden(this.view.hidden()));
    effect(() => this.engine()?.setSpinning(this.view.spinning()));
    effect(() => this.engine()?.setSessions(this.link.placed()));
    effect(() => this.engine()?.setWords(this.engineWords()));
    effect(() => this.engine()?.setPalette(this.themeSwitch.palette()));
  }
}
