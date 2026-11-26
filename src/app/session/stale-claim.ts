import type { SessionState } from '@contract/session';
import type { Claim } from '@contract/sky';
import type { Placed } from './place';

const LIVE: SessionState[] = ['working', 'asking', 'waiting'];

export function staleClaim(
  claim: Claim | null | undefined,
  placed: Placed | null | undefined,
): boolean {
  if (!claim?.heldWeek) return false;
  return !placed || !LIVE.includes(placed.session.state);
}
