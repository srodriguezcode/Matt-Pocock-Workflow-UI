import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { Theme } from '@contract/repo';
import { Api } from '@app/api/api';
import { type Palette, PALETTES } from '@app/sky/draw/palette';
import { stateColours } from './state-colours';

/** Also read by the inline script in `index.html`, which paints before the app boots. */
const THEME_HINT_KEY = 'uaw-theme';

function readHint(): Theme {
  try {
    return localStorage.getItem(THEME_HINT_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function writeHint(theme: Theme): void {
  try {
    localStorage.setItem(THEME_HINT_KEY, theme);
  } catch {}
}

/** The saved theme lives in the per-machine config. Browser storage only steers the first paint. */
@Injectable({ providedIn: 'root' })
export class ThemeSwitch {
  private readonly api = inject(Api);
  readonly theme = signal<Theme>(readHint());
  readonly palette = computed(() => PALETTES[this.theme()]);
  private toggled = false;
  private saving: Promise<unknown> = Promise.resolve();

  constructor() {
    effect(() => this.apply(this.theme(), this.palette()));
  }

  /** A toggle made while the read was in flight is newer than the reply, so the reply is dropped. */
  async load(): Promise<void> {
    try {
      const { theme } = await this.api.settings();
      if (!this.toggled) this.theme.set(theme);
    } catch {}
  }

  /** Saves run one after another, so the config ends on the last choice even when toggles race. */
  toggle(): void {
    this.toggled = true;
    const theme: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(theme);
    this.saving = this.saving.then(() => this.api.saveSettings({ theme })).catch(() => undefined);
  }

  private apply(theme: Theme, palette: Palette): void {
    const root = document.documentElement;
    root.dataset['theme'] = theme;
    for (const [name, value] of Object.entries(stateColours(palette)))
      root.style.setProperty(name, value);
    writeHint(theme);
  }
}
