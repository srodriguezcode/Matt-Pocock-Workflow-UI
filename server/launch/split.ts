import type { RepoConfig } from '@contract/repo';
import type { Sky, System } from '@contract/sky';

/**
 * Appended to a Split Session's system prompt. Without it the agent may publish tickets that are
 * not children of the Spec, and the board draws them as Loose tickets.
 */
export function splitPrompt(repo: RepoConfig, sky: Sky, spec: System): string {
  if (sky.tracker === 'scratch') {
    const folder = `${spec.path ?? spec.id}/issues/`;
    return (
      `Every ticket you publish for this Spec is its child: write each one under ${folder}. ` +
      'The board shows a ticket outside that folder as a Loose ticket.'
    );
  }
  const issues = `repos/${repo.owner}/${repo.name}/issues`;
  return (
    `Every ticket you publish for Spec #${spec.number} is its child. Add each one as a sub-issue ` +
    `of #${spec.number}: \`gh api --method POST ${issues}/${spec.number}/sub_issues ` +
    `-F sub_issue_id=<db id>\`, where the db id is \`gh api ${issues}/<n> --jq .id\`. ` +
    'Adding a sub-issue does not modify the parent issue. ' +
    'The board shows a ticket that is not a sub-issue as a Loose ticket.'
  );
}
