import type { Claim } from '@contract/sky';
import type { RawIssue } from '#server/tracker/tracker.ts';

const DAY_MS = 86_400_000;
const STALE_DAYS = 7;
export const OLD_DAYS = 30;

/** Floored days, so a Claim's and an issue's Age count alike. */
export function daysSince(since: string | null, now: Date): number | null {
  return since === null ? null : Math.floor((now.getTime() - Date.parse(since)) / DAY_MS);
}

export function readClaim(issue: RawIssue, viewer: string | null, now: Date): Claim | null {
  const local = issue.claim !== null && issue.claim.holder === null && issue.assignees.length === 0;
  const mine = local || (viewer !== null && issue.assignees.includes(viewer));
  const holder = mine && !local ? viewer : (issue.claim?.holder ?? issue.assignees[0] ?? null);
  if (!issue.claim && holder === null) return null;
  const since = issue.claim?.since ?? null;
  const ageDays = daysSince(since, now);
  return {
    holder,
    since,
    ageDays,
    heldWeek: ageDays !== null && ageDays >= STALE_DAYS,
    mine,
  };
}
