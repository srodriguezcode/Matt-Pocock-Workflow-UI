import type { Gap } from '@contract/gap';
import type { RepoConfig } from '@contract/repo';
import type { CommandRunner } from '#server/core/runner.ts';
import { gap } from './build.ts';
import { parseOr } from './json.ts';

const QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      subIssuesSummary { total }
      issueDependenciesSummary { totalBlockedBy }
    }
  }
}`;

/** Probes one open issue for both fields at once. A schema error means the repo's plan lacks them. */
export async function checkDependencies(runner: CommandRunner, repo: RepoConfig): Promise<Gap[]> {
  const list = await runner.run(
    'gh',
    ['issue', 'list', '--state', 'open', '--limit', '1', '--json', 'number'],
    { cwd: repo.path },
  );
  const number =
    list.code === 0 ? (parseOr<{ number: number }[]>(list.stdout, [])[0]?.number ?? null) : null;
  if (number === null) return [];
  const probe = await runner.run(
    'gh',
    [
      'api',
      'graphql',
      '-f',
      `query=${QUERY}`,
      '-f',
      `owner=${repo.owner}`,
      '-f',
      `name=${repo.name}`,
      '-F',
      `number=${number}`,
    ],
    { cwd: repo.path },
  );
  if (probe.code === 0) return [];
  return [gap('sub-issues-deps', 'repo', 'thin', { code: 'sub-issues-deps' }, null)];
}
