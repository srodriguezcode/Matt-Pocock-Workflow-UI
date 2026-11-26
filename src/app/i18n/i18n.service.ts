import { Injectable, computed, inject, signal } from '@angular/core';
import { DEFAULT_LOCALE } from './default-locale.token';
import { messageBundles, type SupportedLocale } from './messages';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly activeLocale = signal<SupportedLocale>(inject(DEFAULT_LOCALE));

  readonly locale = this.activeLocale.asReadonly();
  readonly messages = computed(() => messageBundles[this.activeLocale()]);

  setLocale(locale: SupportedLocale): void {
    this.activeLocale.set(locale);
  }
}
