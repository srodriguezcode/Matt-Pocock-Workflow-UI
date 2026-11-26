import { describe, expect, it } from 'vitest';
import type { RepoConfig } from '@contract/repo';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { checkDependencies } from './dependencies.ts';

const repo: RepoConfig = {
  path: '/code/app',
  owner: 'me',
  name: 'app',
  branchPrefixes: [],
  fallbackPrefix: 'feature',
  labels: {},
  tile: { letters: 'AP' },
};

function withOneOpenIssue(): FakeRunner {
  return new FakeRunner().on(['gh', 'issue', 'list'], { stdout: JSON.stringify([{ number: 5 }]) });
}

describe('checkDependencies', () => {
  it('finds nothing when the probe query succeeds', async () => {
    const runner = withOneOpenIssue().on(['gh', 'api', 'graphql'], { code: 0 });
    expect(await checkDependencies(runner, repo)).toEqual([]);
  });

  it('sends owner and name as strings and only the number as a typed value', async () => {
    const numeric = { ...repo, owner: '1234', name: 'true' };
    const runner = withOneOpenIssue().on(['gh', 'api', 'graphql'], { code: 0 });
    await checkDependencies(runner, numeric);
    const args = runner.calls.find((c) => c.args[0] === 'api')!.args;
    const flagOf = (value: string) => args[args.indexOf(value) - 1];
    expect([flagOf('owner=1234'), flagOf('name=true'), flagOf('number=5')]).toEqual([
      '-f',
      '-f',
      '-F',
    ]);
  });

  it('flags a thin Gap when the fields error out', async () => {
    const runner = withOneOpenIssue().on(['gh', 'api', 'graphql'], { code: 1 });
    const gaps = await checkDependencies(runner, repo);
    expect(gaps).toEqual([
      expect.objectContaining({ id: 'sub-issues-deps', scope: 'repo', tier: 'thin', fix: null }),
    ]);
  });

  it('skips the probe when the repo has no open issue', async () => {
    const runner = new FakeRunner().on(['gh', 'issue', 'list'], { stdout: '[]' });
    expect(await checkDependencies(runner, repo)).toEqual([]);
  });
});
