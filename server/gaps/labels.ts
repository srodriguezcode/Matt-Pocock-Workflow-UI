import type { Gap } from '@contract/gap';
import type { CanonicalLabel, RepoConfig } from '@contract/repo';
import type { CommandRunner } from '#server/core/runner.ts';
import { gap } from './build.ts';
import { parseOr } from './json.ts';

/** `wayfinder:*` is covered by requiring `wayfinder:map` alone. The family has no fixed name. */
const CANONICAL: CanonicalLabel[] = [
  'ready-for-agent',
  'ready-for-human',
  'needs-triage',
  'needs-info',
  'to-be-confirmed',
  'spec',
  'wayfinder:map',
];

export async function checkLabels(runner: CommandRunner, repo: RepoConfig): Promise<Gap[]> {
  const result = await runner.run('gh', ['label', 'list', '--json', 'name', '--limit', '200'], {
    cwd: repo.path,
  });
  if (result.code !== 0) return [];
  const have = new Set(parseOr<{ name: string }[]>(result.stdout, []).map((entry) => entry.name));
  const missing = CANONICAL.map((label) => repo.labels[label] ?? label).filter(
    (name) => !have.has(name),
  );
  if (missing.length === 0) return [];
  return [
    gap(
      'labels-missing',
      'repo',
      'thin',
      { code: 'labels-missing' },
      { command: missing.map((name) => `gh label create "${name}"`).join('\n') },
    ),
  ];
}
