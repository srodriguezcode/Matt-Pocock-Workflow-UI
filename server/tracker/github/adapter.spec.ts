import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RepoConfig } from '@contract/repo';
import { withDefaults } from '#server/config/store.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { githubTracker } from './adapter.ts';
import type { IssueNode, RouteNode, SkyPage } from './query.ts';

const repo: RepoConfig = withDefaults({ path: '/code/harbor', owner: 'me', name: 'harbor' });
const harbor = readFileSync(
  new URL('../../sky/fixtures/harbor-graphql.json', import.meta.url),
  'utf8',
);

function node(number: number, extra: Partial<IssueNode> = {}): IssueNode {
  return {
    number,
    title: `Issue ${number}`,
    state: 'OPEN',
    stateReason: null,
    url: `https://github.com/me/harbor/issues/${number}`,
    labels: { nodes: [] },
    body: '',
    assignees: { nodes: [] },
    parent: null,
    blockedBy: { nodes: [] },
    subIssuesSummary: { total: 0, completed: 0 },
    timelineItems: { nodes: [] },
    ...extra,
  };
}

function page(nodes: IssueNode[]): SkyPage {
  return { data: { viewer: { login: 'me' }, repository: { issues: { nodes } } } };
}

describe('githubTracker.read', () => {
  it('runs one paginated GraphQL query in the checkout', async () => {
    const runner = new FakeRunner().on(['gh', 'api', 'graphql'], { stdout: harbor });
    const graph = await githubTracker(runner, repo).read();
    expect(runner.calls).toHaveLength(1);
    const [call] = runner.calls;
    expect(call!.options.cwd).toBe('/code/harbor');
    expect(call!.args).toEqual(
      expect.arrayContaining(['owner=me', 'name=harbor', '--paginate', '--slurp']),
    );
    expect(graph.viewer).toBe('ana-reyes');
    expect(graph.issues.filter((i) => i.state === 'open')).toHaveLength(53);
    expect(graph.issues.filter((i) => i.state === 'closed').map((i) => i.id)).toEqual(
      expect.arrayContaining(['528', '594', '600', '601', '604', '605', '606', '607']),
    );
  });

  it('keeps the closed blockers and closed parents open issues point at', async () => {
    const closedParent = {
      number: 10,
      title: 'Spec: done early',
      state: 'CLOSED' as const,
      stateReason: 'COMPLETED' as const,
      url: 'https://github.com/me/harbor/issues/10',
      labels: { nodes: [{ name: 'spec', color: 'aaaaaa' }] },
      subIssuesSummary: { total: 3, completed: 2 },
    };
    const ruledOut = {
      ...closedParent,
      number: 11,
      title: 'Dropped',
      stateReason: 'NOT_PLANNED' as const,
      parent: { number: 10 },
    };
    const pages = [
      page([node(12, { parent: closedParent, blockedBy: { nodes: [ruledOut] } })]),
      page([node(13, { blockedBy: { nodes: [{ ...ruledOut, parent: null }] } })]),
    ];
    const bodies = { data: { repository: { i10: { body: 'Base: `develop`' } } } };
    const runner = new FakeRunner().on(['gh', 'api'], (call) => ({
      stdout: JSON.stringify(call.args.includes('--paginate') ? pages : bodies),
    }));
    const graph = await githubTracker(runner, repo).read();
    expect(runner.calls).toHaveLength(2);
    expect(runner.calls[1]!.args.at(-1)).toMatch(/i10: issue\(number: 10\) \{ body \}/);
    const byId = new Map(graph.issues.map((i) => [i.id, i]));
    expect(byId.get('10')).toMatchObject({
      state: 'closed',
      body: 'Base: `develop`',
      base: 'develop',
      childIds: ['12'],
      children: { total: 3, closed: 2 },
      labels: [{ name: 'spec', color: 'aaaaaa' }],
    });
    expect(byId.get('11')).toMatchObject({ closeReason: 'not-planned', parentId: '10' });
    expect(byId.get('12')).toMatchObject({ parentId: '10', blockedByIds: ['11'] });
    expect(byId.get('13')!.blockedByIds).toEqual(['11']);
  });

  it('turns a blocker from another repo into an outside blocker while it is open', async () => {
    const elsewhere = { nameWithOwner: 'other/repo' };
    const foreign = (number: number, state: 'OPEN' | 'CLOSED') => ({
      ...node(number, { state }),
      repository: elsewhere,
      parent: null,
    });
    const pages = [
      page([
        node(12, {
          repository: { nameWithOwner: 'me/harbor' },
          blockedBy: { nodes: [foreign(12, 'OPEN'), foreign(40, 'CLOSED')] },
          parent: { ...foreign(9, 'CLOSED'), subIssuesSummary: { total: 1, completed: 0 } },
        }),
      ]),
    ];
    const runner = new FakeRunner().on(['gh', 'api'], { stdout: JSON.stringify(pages) });
    const graph = await githubTracker(runner, repo).read();
    expect(graph.issues).toHaveLength(1);
    expect(graph.issues[0]).toMatchObject({
      id: '12',
      state: 'open',
      blockedByIds: [],
      outsideBlockers: ['other/repo#12'],
      parentId: null,
      childIds: [],
    });
  });

  it('dates a claim from the last assignment', async () => {
    const assigned = node(20, {
      assignees: { nodes: [{ login: 'ana' }, { login: 'bo' }] },
      timelineItems: { nodes: [{ createdAt: '2026-09-01T10:00:00Z' }] },
    });
    const runner = new FakeRunner().on(['gh', 'api'], {
      stdout: JSON.stringify([page([assigned])]),
    });
    const [issue] = (await githubTracker(runner, repo).read()).issues;
    expect(issue!.claim).toEqual({ holder: 'ana', since: '2026-09-01T10:00:00Z' });
  });

  it('reads createdAt, null when the node has none', async () => {
    const dated = node(21, { createdAt: '2026-08-01T10:00:00Z' });
    const runner = new FakeRunner().on(['gh', 'api'], {
      stdout: JSON.stringify([page([dated, node(22)])]),
    });
    const issues = (await githubTracker(runner, repo).read()).issues;
    expect(issues.map((i) => i.createdAt)).toEqual(['2026-08-01T10:00:00Z', null]);
  });

  it('fails on a GraphQL error or a gh failure', async () => {
    const errors = [{ data: null, errors: [{ message: 'Could not resolve to a Repository' }] }];
    const bad = new FakeRunner().on(['gh', 'api'], { stdout: JSON.stringify(errors) });
    await expect(githubTracker(bad, repo).read()).rejects.toThrow('Could not resolve');
    const down = new FakeRunner().on(['gh'], { code: 1, stderr: 'gh: not logged in' });
    await expect(githubTracker(down, repo).read()).rejects.toThrow('gh: not logged in');
  });
});

describe('githubTracker.children', () => {
  it("reads a System's sub-issues in this repo with their blockers in this repo", async () => {
    const elsewhere = { nameWithOwner: 'other/repo' };
    const child = (
      number: number,
      state: 'OPEN' | 'CLOSED',
      blockers: RouteNode['blockedBy']['nodes'] = [],
    ): RouteNode => ({
      number,
      title: `Child ${number}`,
      state,
      stateReason: state === 'OPEN' ? null : number === 7 ? 'NOT_PLANNED' : 'COMPLETED',
      url: `https://github.com/me/harbor/issues/${number}`,
      labels: { nodes: [{ name: 'ready-for-agent', color: '0e8a16' }] },
      subIssuesSummary: { total: 0, completed: 0 },
      blockedBy: { nodes: blockers },
    });
    const nodes = [
      child(6, 'CLOSED'),
      child(7, 'CLOSED', [
        { number: 6, state: 'CLOSED' },
        { number: 9, state: 'OPEN', repository: elsewhere },
      ]),
      child(8, 'OPEN', [{ number: 7, state: 'CLOSED' }]),
      { ...child(30, 'CLOSED'), repository: elsewhere },
    ];
    const reply = { data: { repository: { issue: { subIssues: { nodes } } } } };
    const runner = new FakeRunner().on(['gh', 'api', 'graphql'], {
      stdout: JSON.stringify(reply),
    });
    const children = await githubTracker(runner, repo).children('5');
    expect(runner.calls[0]!.args).toEqual(expect.arrayContaining(['-F', 'number=5']));
    expect(runner.calls[0]!.args).not.toContain('--paginate');
    expect(children.map((c) => [c.id, c.state, c.closeReason, c.parentId, c.blockedByIds])).toEqual(
      [
        ['6', 'closed', 'completed', '5', []],
        ['7', 'closed', 'not-planned', '5', ['6']],
        ['8', 'open', null, '5', ['7']],
      ],
    );
    expect(children[0]).toMatchObject({
      title: 'Child 6',
      url: 'https://github.com/me/harbor/issues/6',
      labels: [{ name: 'ready-for-agent', color: '0e8a16' }],
    });
  });
});

describe('githubTracker.taken', () => {
  it('reads a held issue from its first assignee', async () => {
    const runner = new FakeRunner().on(['gh', 'issue', 'view', '613'], {
      stdout: JSON.stringify({ state: 'OPEN', assignees: [{ login: 'ana' }] }),
    });
    const tracker = githubTracker(runner, repo);
    expect(await tracker.taken({ id: '613', handle: '#613' })).toEqual({
      code: 'held',
      handle: '#613',
      holder: 'ana',
    });
    expect(runner.lines()).toEqual([tracker.takenCommand('613')]);
    expect(tracker.takenCommand('613')).toBe(
      `gh issue view 613 -R ${repo.owner}/${repo.name} --json state,assignees`,
    );
  });

  it('reads a closed issue as closed, even with an assignee', async () => {
    const runner = new FakeRunner().on(['gh', 'issue', 'view', '613'], {
      stdout: JSON.stringify({ state: 'CLOSED', assignees: [{ login: 'ana' }] }),
    });
    expect(await githubTracker(runner, repo).taken({ id: '613', handle: '#613' })).toEqual({
      code: 'closed',
      handle: '#613',
    });
  });

  it('is not taken for an open issue with no assignee', async () => {
    const runner = new FakeRunner().on(['gh', 'issue', 'view', '613'], {
      stdout: JSON.stringify({ state: 'OPEN', assignees: [] }),
    });
    expect(await githubTracker(runner, repo).taken({ id: '613', handle: '#613' })).toBeNull();
  });
});

describe('githubTracker.isId', () => {
  it('takes only a number', () => {
    const tracker = githubTracker(new FakeRunner(), repo);
    expect(tracker.isId('613')).toBe(true);
    for (const id of ['--repo=x', '613 ', 'a/1', '']) expect(tracker.isId(id)).toBe(false);
  });
});

describe('githubTracker.branchSlug', () => {
  it('slugs by number, falling back to the id for a bare ref', () => {
    const tracker = githubTracker(new FakeRunner(), repo);
    const ref = {
      id: '613',
      handle: '#613',
      number: 613,
      title: '',
      url: null,
      path: null,
      labels: [],
    };
    expect(tracker.branchSlug(ref)).toBe('613');
    expect(tracker.branchSlug({ ...ref, number: null })).toBe('613');
  });
});

describe('githubTracker issue calls', () => {
  it('reads body and comments', async () => {
    const runner = new FakeRunner().on(['gh', 'issue', 'view', '613'], {
      stdout: JSON.stringify({
        number: 613,
        title: 'Paths',
        state: 'CLOSED',
        url: 'https://github.com/me/harbor/issues/613',
        labels: [{ id: 'x', name: 'ready-for-human', color: 'fbca04', description: '' }],
        body: 'Body',
        comments: [
          { author: { login: 'ana' }, createdAt: '2026-09-02T00:00:00Z', body: 'Hi' },
          { author: null, createdAt: '2026-09-03T00:00:00Z', body: 'Gone' },
        ],
      }),
    });
    expect(await githubTracker(runner, repo).detail('613')).toEqual({
      id: '613',
      handle: '#613',
      number: 613,
      title: 'Paths',
      url: 'https://github.com/me/harbor/issues/613',
      path: null,
      labels: [{ name: 'ready-for-human', color: 'fbca04' }],
      state: 'closed',
      body: 'Body',
      comments: [
        { author: 'ana', createdAt: '2026-09-02T00:00:00Z', body: 'Hi' },
        { author: 'ghost', createdAt: '2026-09-03T00:00:00Z', body: 'Gone' },
      ],
    });
  });

  it('claims and releases by assignment, and shows the same command lines', async () => {
    const runner = new FakeRunner().on(['gh', 'issue', 'edit'], {});
    const tracker = githubTracker(runner, repo);
    expect(await tracker.claim('613')).toBeNull();
    await tracker.release('613', null);
    expect(runner.lines()).toEqual([tracker.claimCommand('613'), tracker.releaseCommand('613')]);
    expect(tracker.claimCommand('613')).toBe('gh issue edit 613 --add-assignee @me');
    expect(tracker.releaseCommand('613')).toBe('gh issue edit 613 --remove-assignee @me');
  });
});

describe('githubTracker flag', () => {
  const missing = {
    code: 1,
    stderr: "failed to update https://github.com/me/harbor/issues/613: 'flagged' not found",
  };

  it('reads flagged from the label', async () => {
    const flagged = node(30, { labels: { nodes: [{ name: 'flagged', color: 'f5c542' }] } });
    const runner = new FakeRunner().on(['gh', 'api'], {
      stdout: JSON.stringify([page([flagged, node(31)])]),
    });
    const issues = (await githubTracker(runner, repo).read()).issues;
    expect(issues.map((i) => [i.id, i.flagged])).toEqual([
      ['30', true],
      ['31', false],
    ]);
  });

  it('adds and removes the label, and shows the same command lines', async () => {
    const runner = new FakeRunner().on(['gh', 'issue', 'edit'], {});
    const tracker = githubTracker(runner, repo);
    await tracker.flag('613', true);
    await tracker.flag('613', false);
    expect(runner.lines()).toEqual([
      tracker.flagCommand('613', true),
      tracker.flagCommand('613', false),
    ]);
    expect(tracker.flagCommand('613', true)).toBe('gh issue edit 613 --add-label flagged');
    expect(tracker.flagCommand('613', false)).toBe('gh issue edit 613 --remove-label flagged');
  });

  it('creates a missing label, then retries the add once', async () => {
    const runner = new FakeRunner()
      .on(['gh', 'issue', 'edit'], {})
      .on(['gh', 'issue', 'edit'], missing, 1)
      .on(['gh', 'label', 'create'], {});
    await githubTracker(runner, repo).flag('613', true);
    expect(runner.lines()).toEqual([
      'gh issue edit 613 --add-label flagged',
      'gh label create flagged --color f5c542 --description Marked on the board to find again',
      'gh issue edit 613 --add-label flagged',
    ]);
  });

  it('never re-creates a label that exists', async () => {
    const runner = new FakeRunner()
      .on(['gh', 'issue', 'edit'], { code: 1, stderr: 'HTTP 502: Bad Gateway' })
      .on(['gh', 'label', 'create'], {});
    await expect(githubTracker(runner, repo).flag('613', true)).rejects.toThrow('Bad Gateway');
    await expect(githubTracker(runner, repo).flag('613', false)).rejects.toThrow('Bad Gateway');
    expect(runner.lines().filter((l) => l.startsWith('gh label'))).toEqual([]);
  });

  it('fails when the retry fails too', async () => {
    const runner = new FakeRunner()
      .on(['gh', 'issue', 'edit'], missing)
      .on(['gh', 'label', 'create'], {});
    await expect(githubTracker(runner, repo).flag('613', true)).rejects.toThrow('not found');
    expect(runner.lines().filter((l) => l.startsWith('gh issue edit'))).toHaveLength(2);
  });
});
