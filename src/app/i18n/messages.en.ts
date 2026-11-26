import { architecture } from '@app/i18n/en/architecture';
import { codes } from '@app/i18n/en/codes';
import { demo } from '@app/i18n/en/demo';
import { empty } from '@app/i18n/en/empty';
import { filter } from '@app/i18n/en/filter';
import { gaps } from '@app/i18n/en/gaps';
import { keys } from '@app/i18n/en/keys';
import { layout } from '@app/i18n/en/layout';
import { newSession } from '@app/i18n/en/new-session';
import { panel } from '@app/i18n/en/panel';
import { pill } from '@app/i18n/en/pill';
import { rail } from '@app/i18n/en/rail';
import { refresh } from '@app/i18n/en/refresh';
import { session } from '@app/i18n/en/session';
import { sheet } from '@app/i18n/en/sheet';
import { sky } from '@app/i18n/en/sky';

/**
 * `TranslationBundle` is this object's own shape, so a key added in any feature file is a key
 * every other locale owes. Dates, ages and plurals are worded inside the leaves.
 */
export const englishMessages = {
  board: {
    sky,
    panel,
    session,
    pill,
    sheet,
    rail,
    gaps,
    refresh,
    filter,
    empty,
    keys,
    layout,
    architecture,
    newSession,
    codes,
    demo,
  },
};
