import type { CanonicalLabel, LabelRemaps } from '@contract/repo';
import type { Readiness, TicketKind } from '@contract/sky';
import type { RawIssue } from '#server/tracker/tracker.ts';

export const UNDECIDED: CanonicalLabel[] = ['to-be-confirmed', 'needs-triage', 'needs-info'];

/**
 * Upstream `/to-spec` adds no label or title mark, so its template headings mark the Spec.
 * Three, since a ticket body can hold one or two of these words as its own sections.
 */
const SPEC_HEADINGS = [
  'problem statement',
  'solution',
  'user stories',
  'implementation decisions',
  'testing decisions',
  'out of scope',
];

function hasSpecHeadings(body: string): boolean {
  const found = new Set(
    [...body.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].map((match) => match[1]!.toLowerCase()),
  );
  return SPEC_HEADINGS.filter((heading) => found.has(heading)).length >= 3;
}

export interface Roles {
  map: boolean;
  spec: boolean;
  kind: TicketKind;
  research: boolean;
  readiness: Readiness;
  readinessConflict: boolean;
}

export function labelRoles(issue: RawIssue, remaps: LabelRemaps): Roles {
  const names = new Set(issue.labels.map((label) => label.name));
  const has = (canonical: CanonicalLabel) => names.has(remaps[canonical] ?? canonical);
  const family = remaps['wayfinder:'] ?? 'wayfinder:';
  const mapLabel = remaps['wayfinder:map'] ?? `${family}map`;
  const map = names.has(mapLabel) || issue.systemHint === 'map';
  const decision =
    issue.typeLine !== null ||
    [...names].some((name) => name.startsWith(family) && name !== mapLabel);
  const spec =
    has('spec') ||
    /^spec:/i.test(issue.title.trim()) ||
    issue.systemHint === 'spec' ||
    (!map && !decision && hasSpecHeadings(issue.body));
  const found = new Set<Readiness>();
  if (UNDECIDED.some(has)) found.add('undecided');
  if (!decision && has('ready-for-human')) found.add('ready-for-human');
  if (!decision && has('ready-for-agent')) found.add('ready-for-agent');
  const readiness =
    (['undecided', 'ready-for-human', 'ready-for-agent'] as const).find((r) => found.has(r)) ??
    'none';
  const research =
    decision &&
    (names.has(`${family}research`) || issue.typeLine?.trim().toLowerCase() === 'research');
  return {
    map,
    spec,
    kind: decision ? 'decision' : 'build',
    research,
    readiness,
    readinessConflict: found.size > 1,
  };
}
