import type { ModelUsage } from './session.ts';

/** US dollars per million tokens, from Anthropic's first-party API list prices. */
interface Price {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

/** Cache writes follow input on every model. Cache reads don't, so each model names its own. */
function price(input: number, output: number, cacheRead: number): Price {
  return { input, output, cacheWrite5m: input * 1.25, cacheWrite1h: input * 2, cacheRead };
}

const PRICES: Record<string, Price> = {
  'claude-fable-5-1': price(10, 50, 0.25),
  'claude-mythos-5-1': price(10, 50, 0.25),
  'claude-fable-5': price(10, 50, 1),
  'claude-mythos-5': price(10, 50, 1),
  'claude-opus-5-5': price(4, 20, 0.2),
  'claude-opus-5': price(5, 25, 0.5),
  'claude-opus-4-8': price(5, 25, 0.5),
  'claude-opus-4-7': price(5, 25, 0.5),
  'claude-opus-4-6': price(5, 25, 0.5),
  'claude-sonnet-5-5': price(2, 10, 0.2),
  'claude-sonnet-5': price(2, 10, 0.2),
  'claude-sonnet-4-6': price(3, 15, 0.3),
  'claude-haiku-4-5': price(1, 5, 0.1),
};

/** `null` for a model the table doesn't price. A dated snapshot id prices as its model. */
export function dollarsOf(usage: ModelUsage): number | null {
  const rate = PRICES[usage.model.replace(/-\d{8}$/, '')];
  if (!rate) return null;
  const hour = Math.min(usage.cacheCreation1h, usage.cacheCreation);
  const perMillion =
    usage.input * rate.input +
    usage.output * rate.output +
    (usage.cacheCreation - hour) * rate.cacheWrite5m +
    hour * rate.cacheWrite1h +
    usage.cacheRead * rate.cacheRead;
  return perMillion / 1_000_000;
}
