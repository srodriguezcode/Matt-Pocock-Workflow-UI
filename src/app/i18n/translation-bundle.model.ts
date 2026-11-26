import type { englishMessages } from './messages.en';

/**
 * The contract every locale answers to: the English bundle's own shape, derived rather than
 * restated beside it. The union-keyed groups stay in `translation-name-groups.model`.
 */
export type TranslationBundle = typeof englishMessages;

export type CodesBundle = TranslationBundle['board']['codes'];
