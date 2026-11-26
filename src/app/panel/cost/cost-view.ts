import type { CostReading, TokenCounts } from '@contract/cost';
import type { TranslationBundle } from '@app/i18n/translation-bundle.model';
import { word } from '@app/i18n/word';

type CostText = TranslationBundle['board']['panel']['cost'];

export interface CostView {
  none: boolean;
  tokens: string;
  dollars: string;
  breakdown: string;
  working: string;
  shortfalls: string[];
}

const KINDS: (keyof TokenCounts)[] = ['input', 'output', 'cacheCreation', 'cacheRead'];

export function costView(reading: CostReading, text: CostText): CostView {
  const { input, output, cacheCreation } = reading.tokens;
  return {
    none: reading.sessions === 0,
    tokens: text.tokens(input + output + cacheCreation),
    dollars: text.dollars(reading.dollars),
    breakdown: KINDS.map((kind) =>
      text.tokenLine(text.tokenKinds[kind], reading.tokens[kind]),
    ).join('\n'),
    working: text.workingFor(reading.workingMs),
    shortfalls: reading.partial.map((shortfall) => word(text.shortfalls, shortfall)),
  };
}
