import type { RepoConfig } from '@contract/repo';
import type { SessionView } from '@contract/session';
import { starIdOf } from './place';
import type { Sky } from '@contract/sky';

export type NotificationReason = 'ask' | 'round' | 'reply' | 'permission' | 'finished';

/** One Session that waits on the user, wherever its repo is. */
export interface Notification {
  sessionId: string;
  repo: string;
  repoName: string;
  /** `null` for a new session: it opens in the panel, not on a star. */
  starId: string | null;
  /**
   * The star's handle and title when its repo's sky is loaded, else `null`.
   * A new session has no handle, and its title is its first line.
   */
  handle: string | null;
  title: string | null;
  reason: NotificationReason;
  since: string;
}

/** Asking and Waiting Sessions across every repo, the longest waiting first. */
export function notificationsOf(
  sessions: Iterable<SessionView>,
  repos: RepoConfig[],
  active: { path: string; sky: Sky; placed: ReadonlyMap<string, { session: SessionView }> } | null,
): Notification[] {
  const out: Notification[] = [];
  for (const session of sessions) {
    const sky = active?.path === session.repo ? active.sky : null;
    const reason = reasonOf(session, sky);
    if (!reason) continue;
    const repo = repos.find((r) => r.path === session.repo);
    const starId = placedOn(session, active) ?? starIdOf(session.target);
    const star = sky
      ? (sky.tickets.find((t) => t.id === starId) ??
        sky.systems.find((s) => s.id === starId) ??
        sky.embers.find((e) => e.id === starId))
      : undefined;
    out.push({
      sessionId: session.sessionId,
      repo: session.repo,
      repoName: repo?.name ?? session.repo,
      starId,
      handle: star?.handle ?? null,
      title:
        session.target.kind === 'session' ? session.target.title || null : (star?.title ?? null),
      reason,
      since: session.since,
    });
  }
  return out.sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
}

function reasonOf(session: SessionView, sky: Sky | null): NotificationReason | null {
  const kind = session.question?.kind;
  if (session.state === 'asking') return kind === 'round' ? 'round' : 'ask';
  if (session.state !== 'waiting') return null;
  if (session.waiting === 'permission-prompt') return 'permission';
  const id = starIdOf(session.target);
  return sky && id !== null && isClosed(id, sky) ? 'finished' : 'reply';
}

/** The sky holds every open issue, so a target missing from it is closed. */
function isClosed(id: string, sky: Sky): boolean {
  if (sky.mapId === id || sky.tickets.some((t) => t.id === id)) return false;
  const system = sky.systems.find((s) => s.id === id);
  return !system || system.closed;
}

function placedOn(
  session: SessionView,
  active: { path: string; placed: ReadonlyMap<string, { session: SessionView }> } | null,
): string | null {
  if (!active || active.path !== session.repo) return null;
  for (const [id, placed] of active.placed) {
    if (placed.session.sessionId === session.sessionId) return id;
  }
  return null;
}
