import type { CostReading, TokenCounts } from '@contract/cost';
import { API_LIMITS_ID, LATE_LOAN_ID, LEND_BOOKS_MAP_ID, SHELF_PATH } from './mock';

const MINUTE_MS = 60_000;

const FIXED: Record<string, Omit<CostReading, 'id'>> = {
  [LATE_LOAN_ID]: {
    sessions: 2,
    tokens: { input: 38_000, output: 74_000, cacheCreation: 300_000, cacheRead: 1_850_000 },
    dollars: 1.84,
    workingMs: 14 * MINUTE_MS,
    partial: [],
  },
  [API_LIMITS_ID]: {
    sessions: 1,
    tokens: { input: 9_000, output: 21_000, cacheCreation: 72_000, cacheRead: 380_000 },
    dollars: 0.46,
    workingMs: 5 * MINUTE_MS,
    partial: [],
  },
};

const NONE: Omit<CostReading, 'id'> = {
  sessions: 0,
  tokens: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
  dollars: 0,
  workingMs: 0,
  partial: [],
};

function sum(readings: Omit<CostReading, 'id'>[]): Omit<CostReading, 'id'> {
  const tokens: TokenCounts = { ...NONE.tokens };
  for (const reading of readings)
    for (const kind of Object.keys(tokens) as (keyof TokenCounts)[])
      tokens[kind] += reading.tokens[kind];
  return {
    sessions: readings.reduce((n, r) => n + r.sessions, 0),
    tokens,
    dollars: readings.reduce((n, r) => n + r.dollars, 0),
    workingMs: readings.reduce((n, r) => n + r.workingMs, 0),
    partial: [],
  };
}

export function demoCost(repo: string, id: string): CostReading {
  if (repo !== SHELF_PATH) return { id, ...NONE };
  if (id === LEND_BOOKS_MAP_ID) return { id, ...sum(Object.values(FIXED)) };
  return { id, ...(FIXED[id] ?? NONE) };
}
