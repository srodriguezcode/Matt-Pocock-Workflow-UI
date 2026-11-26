export interface TokenCounts {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

/** `handles` are the issues whose transcripts are gone. */
export type CostShortfall =
  { code: 'aged-out'; handles: string[] } | { code: 'no-price'; models: string[] };

/** `GET /api/cost?repo=&id=`: the Cost and Working time of one open Ticket or System. */
export interface CostReading {
  id: string;
  sessions: number;
  /** Includes cache reads, which the headline total leaves out. */
  tokens: TokenCounts;
  /** API-equivalent US dollars over the priced models only. */
  dollars: number;
  workingMs: number;
  partial: CostShortfall[];
}
