import { describe, expect, it } from 'vitest';
import { englishMessages } from './messages.en';
import type { LocaleRegistry } from './messages';
import type { CodesBundle, TranslationBundle } from './translation-bundle.model';
import type { GapTierNames, StartReasonWording } from './translation-name-groups.model';

type Registers<T> = T extends LocaleRegistry<T> ? true : false;

type Board = TranslationBundle['board'];

type WithCodes<C> = { board: Omit<Board, 'codes'> & { codes: C } };

const pseudo = {
  board: {
    ...englishMessages.board,
    codes: {
      ...englishMessages.board.codes,
      gapTiers: { fatal: '[No sky]', start: '[Blocks Start]', thin: '[Thins the sky]' },
    },
  },
};

type Complete = { en: TranslationBundle; xx: typeof pseudo };
type MissingFeature = { en: TranslationBundle; xx: { board: Omit<Board, 'codes'> } };
type MissingNameArm = {
  en: TranslationBundle;
  xx: WithCodes<Omit<CodesBundle, 'gapTiers'> & { gapTiers: Omit<GapTierNames, 'thin'> }>;
};
type MissingCodeArm = {
  en: TranslationBundle;
  xx: WithCodes<
    Omit<CodesBundle, 'startReasons'> & { startReasons: Omit<StartReasonWording, 'gap'> }
  >;
};
type WrongLeaf = {
  en: TranslationBundle;
  xx: WithCodes<Omit<CodesBundle, 'gapTiers'> & { gapTiers: Record<keyof GapTierNames, number> }>;
};

describe('a second locale', () => {
  it('registers when it has every key, and fails to compile when it lacks one', () => {
    const verdicts: [
      Registers<Complete>,
      Registers<MissingFeature>,
      Registers<MissingNameArm>,
      Registers<MissingCodeArm>,
      Registers<WrongLeaf>,
    ] = [true, false, false, false, false];
    expect(verdicts).toEqual([true, false, false, false, false]);
  });
});
