import { join } from 'node:path';
import type { RawGraph, RawIssue } from '#server/tracker/tracker.ts';
import type { Dates, Overlay } from './mock-repo.ts';

const DAY_MS = 86_400_000;

export const daysAgo = (now: Date, days: number): string =>
  new Date(now.getTime() - days * DAY_MS).toISOString();

export function applyOverlay(
  raw: RawGraph,
  repoPath: string,
  overlay: Overlay,
  claimed: Dates['claimed'],
  now: Date,
): RawGraph {
  const loose = new Set(overlay.loose ?? []);
  const byPath = new Map(raw.issues.map((issue) => [issue.path, issue.id]));
  const claimDays = new Map(
    Object.entries(claimed).map(([path, days]) => [known(byPath, join(repoPath, path)), days]),
  );
  const ids = new Set(raw.issues.map((issue) => issue.id));
  for (const id of [
    ...loose,
    ...Object.keys(overlay.blockedBy ?? {}),
    ...Object.values(overlay.blockedBy ?? {}).flat(),
  ]) {
    if (!ids.has(id)) throw new Error(`overlay.json names ${id}, which is not an effort`);
  }
  const issues = raw.issues
    .filter((issue) => !loose.has(issue.id))
    .map((issue): RawIssue => {
      const days = claimDays.get(issue.id);
      if (days !== undefined && !issue.claim)
        throw new Error(`dates.json claims ${issue.id}, but its Status is not claimed`);
      return {
        ...issue,
        parentId: issue.parentId !== null && loose.has(issue.parentId) ? null : issue.parentId,
        claim: days === undefined ? issue.claim : { holder: null, since: daysAgo(now, days) },
        blockedByIds: [...issue.blockedByIds, ...(overlay.blockedBy?.[issue.id] ?? [])],
      };
    });
  return { ...raw, issues };
}

function known(byPath: Map<string | null, string>, path: string): string {
  const id = byPath.get(path);
  if (id === undefined) throw new Error(`dates.json claims ${path}, which is not a ticket`);
  return id;
}
