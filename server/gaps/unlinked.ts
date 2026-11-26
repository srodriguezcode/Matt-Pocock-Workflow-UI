import type { Gap } from '@contract/gap';
import type { RepoConfig } from '@contract/repo';
import type { Sky } from '@contract/sky';
import { gap } from './build.ts';

/**
 * An open Spec with no children whose tickets name it only in their `## Parent` section. The fix
 * shows the link calls, since the board's only writes are Claim, Release and Flag.
 */
export function unlinkedTickets(sky: Sky | null, repo: RepoConfig): Gap[] {
  if (sky === null || sky.tracker !== 'github') return [];
  return sky.systems.flatMap((spec) => {
    if (spec.kind !== 'spec' || spec.closed || spec.state !== 'needs-tickets') return [];
    const loose = sky.tickets.filter((t) => t.systemId === null && t.namedParentId === spec.id);
    if (loose.length === 0) return [];
    const issues = `repos/${repo.owner}/${repo.name}/issues`;
    const command = loose
      .map(
        (t) =>
          `gh api --method POST ${issues}/${spec.number}/sub_issues -F sub_issue_id="$(gh api ${issues}/${t.number} --jq .id)"`,
      )
      .join('\n');
    return [
      gap(
        `unlinked-${spec.id}`,
        'repo',
        'thin',
        { code: 'tickets-unlinked', handle: spec.handle, count: loose.length },
        { command },
        [],
        [],
        [spec.id, ...loose.map((t) => t.id)],
      ),
    ];
  });
}
