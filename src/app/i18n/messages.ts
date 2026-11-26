import { englishMessages } from './messages.en';
import type { TranslationBundle } from './translation-bundle.model';

export const messageBundles = {
  en: englishMessages,
};

export type LocaleRegistry<T> = Record<Exclude<keyof T, 'en'>, TranslationBundle>;

/**
 * A `satisfies` over the registry would only check English against itself.
 * This constrains every locale that is not the default.
 */
type AnsweringToEnglish<T extends LocaleRegistry<T>> = T;

export type SupportedLocale = keyof AnsweringToEnglish<typeof messageBundles>;
