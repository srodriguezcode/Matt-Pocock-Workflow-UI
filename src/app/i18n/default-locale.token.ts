import { InjectionToken } from '@angular/core';
import type { SupportedLocale } from './messages';

export const DEFAULT_LOCALE = new InjectionToken<SupportedLocale>('defaultLocale', {
  providedIn: 'root',
  factory: () => 'en',
});
