import { computed, inject, Injectable, signal } from '@angular/core';
import type { Runtime } from '@contract/runtime';
import { Api } from '@app/api/api';

/** Where the board runs. Runtime-only controls read `container`. Until the read lands, the board acts as the Mac one. */
@Injectable({ providedIn: 'root' })
export class RuntimeInfo {
  private readonly api = inject(Api);
  private readonly value = signal<Runtime>('mac');

  private readonly read = signal(false);

  readonly runtime = this.value.asReadonly();
  /** `false` until a read lands, so `container` is still the Mac default. */
  readonly loaded = this.read.asReadonly();
  readonly container = computed(() => this.value() === 'container');

  async load(): Promise<void> {
    try {
      this.value.set((await this.api.runtime()).runtime);
      this.read.set(true);
    } catch (error) {
      console.error(error);
    }
  }
}
