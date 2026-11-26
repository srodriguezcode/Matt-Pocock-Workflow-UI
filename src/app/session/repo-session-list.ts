import type { NewSessionRef } from '@contract/launch';
import type { SessionView } from '@contract/session';

export type RepoSession = SessionView & { target: NewSessionRef };

/** The active repo's new sessions, newest first. An Ended one leaves the list. */
export function repoSessionsOf(
  sessions: Iterable<SessionView>,
  repo: string | null,
): RepoSession[] {
  const mine: RepoSession[] = [];
  for (const session of sessions) {
    if (session.repo !== repo || session.state === 'ended') continue;
    if (session.target.kind === 'session') mine.push(session as RepoSession);
  }
  return mine.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}
