import type { TranslationBundle } from '@app/i18n/translation-bundle.model';

/** `read 14:02`, or `last read 14:02` once a later read failed. Local time. */
export function readLabel(
  refresh: TranslationBundle['board']['refresh'],
  readAt: string | null,
  failed: boolean,
): string {
  if (!readAt) return failed ? refresh.readFailed : refresh.notReadYet;
  const hhmm = refresh.time(readAt);
  return failed ? refresh.lastRead(hhmm) : refresh.read(hhmm);
}
