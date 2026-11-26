import { afterEach, describe, expect, it, vi } from 'vitest';
import { withDefaults } from '#server/config/store.ts';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { HttpError } from '#server/http/types.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { FakeTracker } from '#server/testing/fake-tracker.ts';
import { githubTracker } from './github/adapter.ts';
import { scratchTracker } from './scratch/adapter.ts';
import { flagIssue, issueId } from './routes.ts';

const repo = withDefaults({ path: '/code/app', owner: 'me', name: 'app' });
const github = githubTracker(new FakeRunner(), repo);
const scratch = scratchTracker(new FakeFs({}), new FakeRunner(), repo);

describe('issueId', () => {
  it('takes only a number on GitHub', () => {
    expect(issueId(github, '613')).toBe('613');
    for (const id of ['--repo=x', '613 ', 'a/1', '', 613]) {
      expect(() => issueId(github, id)).toThrow('bad issue id');
    }
  });

  it('takes only <effort>/<NN> or a bare effort in .scratch/', () => {
    expect(issueId(scratch, 'board-v2/03')).toBe('board-v2/03');
    expect(issueId(scratch, 'ci-hooks')).toBe('ci-hooks');
    for (const id of ['../03', '.hidden/03', '.hidden', '..', 'a/b/03', 'effort/x', 'a b']) {
      expect(() => issueId(scratch, id)).toThrow('bad issue id');
    }
  });
});

describe('flagIssue', () => {
  const tracker = () => new FakeTracker({ tracker: 'github', viewer: 'me', issues: [] });

  afterEach(() => vi.restoreAllMocks());

  it('writes the flag and prints the command', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fake = tracker();
    expect(await flagIssue(fake, '613', true)).toEqual({ status: 200, body: {} });
    await flagIssue(fake, '613', false);
    expect(fake.writes).toEqual(['flag 613', 'unflag 613']);
    expect(log.mock.calls).toEqual([['flag 613'], ['unflag 613']]);
  });

  it('turns a failed write into flag-failed with the raw error', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fake = tracker();
    fake.failFlagOn = '613';
    const failure = await flagIssue(fake, '613', true).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HttpError);
    expect(failure).toMatchObject({
      status: 502,
      message: 'flag 613 failed',
      reason: { code: 'flag-failed' },
    });
  });
});
