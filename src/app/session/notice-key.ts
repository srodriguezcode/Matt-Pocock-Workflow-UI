import type { SessionView } from '@contract/session';

/** `sessionId@since`, so a mark lasts only until the Session moves again. */
export const noticeKey = (session: Pick<SessionView, 'sessionId' | 'since'>) =>
  `${session.sessionId}@${session.since}`;

/** Splits off what the user already opened in Peek. Those still list, but no longer count. */
export function unseen<T extends Pick<SessionView, 'sessionId' | 'since'>>(
  items: Iterable<T>,
  seen: ReadonlySet<string>,
): T[] {
  return [...items].filter((item) => !seen.has(noticeKey(item)));
}
