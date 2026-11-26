import type { SessionView } from '@contract/session';

export function attentionCount(sessions: Iterable<SessionView>): number {
  let count = 0;
  for (const { state } of sessions) if (state === 'asking' || state === 'waiting') count++;
  return count;
}
