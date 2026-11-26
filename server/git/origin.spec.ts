import { describe, expect, it } from 'vitest';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { originBranches, parseGithubRemote } from './origin.ts';

describe('originBranches', () => {
  it('lists heads and the default branch', async () => {
    const runner = new FakeRunner().on(['git', 'ls-remote'], {
      stdout: [
        'ref: refs/heads/main\tHEAD',
        'aaa\tHEAD',
        'bbb\trefs/heads/main',
        'ccc\trefs/heads/develop',
      ].join('\n'),
    });
    expect(await originBranches(runner, '/code/app')).toEqual({
      branches: ['develop', 'main'],
      defaultBranch: 'main',
    });
  });
});

describe('parseGithubRemote', () => {
  it('reads ssh and https remotes', () => {
    expect(parseGithubRemote('git@github.com:me/app.git')).toEqual({ owner: 'me', name: 'app' });
    expect(parseGithubRemote('https://github.com/me/app\n')).toEqual({ owner: 'me', name: 'app' });
  });

  it('refuses other hosts', () => {
    expect(parseGithubRemote('git@gitlab.com:me/app.git')).toBeNull();
  });
});
