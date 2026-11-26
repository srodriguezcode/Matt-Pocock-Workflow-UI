import { describe, expect, it } from 'vitest';
import type { RepoConfig } from '@contract/repo';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { checkLabels } from './labels.ts';

const repo: RepoConfig = {
  path: '/code/app',
  owner: 'me',
  name: 'app',
  branchPrefixes: [],
  fallbackPrefix: 'feature',
  labels: {},
  tile: { letters: 'AP' },
};

function withLabels(names: string[]): FakeRunner {
  return new FakeRunner().on(['gh', 'label', 'list'], {
    stdout: JSON.stringify(names.map((name) => ({ name }))),
  });
}

describe('checkLabels', () => {
  it('finds nothing when every canonical label is on the repo', async () => {
    const runner = withLabels([
      'ready-for-agent',
      'ready-for-human',
      'needs-triage',
      'needs-info',
      'to-be-confirmed',
      'spec',
      'wayfinder:map',
    ]);
    expect(await checkLabels(runner, repo)).toEqual([]);
  });

  it('lists a create command per missing label, thin tier', async () => {
    const runner = withLabels(['ready-for-agent']);
    const gaps = await checkLabels(runner, repo);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ id: 'labels-missing', scope: 'repo', tier: 'thin' });
    expect(gaps[0]?.fix).toEqual({
      command: [
        'gh label create "ready-for-human"',
        'gh label create "needs-triage"',
        'gh label create "needs-info"',
        'gh label create "to-be-confirmed"',
        'gh label create "spec"',
        'gh label create "wayfinder:map"',
      ].join('\n'),
    });
  });

  it('checks the remapped name, not the canonical one', async () => {
    const remapped: RepoConfig = { ...repo, labels: { spec: 'kind:spec' } };
    const runner = withLabels([
      'ready-for-agent',
      'ready-for-human',
      'needs-triage',
      'needs-info',
      'to-be-confirmed',
      'kind:spec',
      'wayfinder:map',
    ]);
    expect(await checkLabels(runner, remapped)).toEqual([]);
  });

  it('gives up quietly when gh fails', async () => {
    const runner = new FakeRunner().on(['gh', 'label', 'list'], { code: 1 });
    expect(await checkLabels(runner, repo)).toEqual([]);
  });
});
