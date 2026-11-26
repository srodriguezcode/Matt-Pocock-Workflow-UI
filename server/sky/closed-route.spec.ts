import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { withDefaults } from '#server/config/store.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { githubTracker } from '#server/tracker/github/adapter.ts';
import type { RouteNode } from '#server/tracker/github/query.ts';
import { readClosedRoute } from './closed-route.ts';

const uaw = withDefaults({ path: '/code/uaw', owner: 'srodriguezcode', name: 'UI-Agent-Workflow' });

function routeOf(stdout: string, id: string) {
  const runner = new FakeRunner().on(['gh', 'api', 'graphql'], { stdout });
  return readClosedRoute(githubTracker(runner, uaw), id);
}

describe('the closed route of Spec #16', () => {
  const recorded = readFileSync(
    new URL('./fixtures/uaw-route-graphql.json', import.meta.url),
    'utf8',
  );

  it('carries its closed tickets with their labels', async () => {
    const route = await routeOf(recorded, '16');
    expect(route.systemId).toBe('16');
    expect(route.children.map((c) => c.id).slice(0, 3)).toEqual(['17', '18', '19']);
    expect(route.children.every((c) => c.gate === 'done')).toBe(true);
    expect(route.children[0]).toMatchObject({
      handle: '#17',
      number: 17,
      url: 'https://github.com/srodriguezcode/UI-Agent-Workflow/issues/17',
    });
    expect(route.children[0]!.labels.map((l) => l.name)).toContain('ready-for-agent');
  });

  it('draws the satisfied Lanes out of them', async () => {
    const route = await routeOf(recorded, '16');
    const lanes = route.lanes.filter((d) => d.blocked === '30');
    expect(lanes.map((d) => d.id).sort()).toEqual(['23->30', '25->30', '29->30']);
    expect(route.lanes.every((d) => d.kind === 'lane' && d.satisfied && !d.hot)).toBe(true);
  });
});

describe('a closed route', () => {
  const node = (number: number, over: Partial<RouteNode> = {}): RouteNode => ({
    number,
    title: `Child ${number}`,
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    url: `https://github.com/srodriguezcode/UI-Agent-Workflow/issues/${number}`,
    labels: { nodes: [] },
    subIssuesSummary: { total: 0, completed: 0 },
    blockedBy: { nodes: [] },
    ...over,
  });
  const reply = (nodes: RouteNode[]) =>
    JSON.stringify({ data: { repository: { issue: { subIssues: { nodes } } } } });

  it('leaves out a closed child that still holds an open one, and Lanes from open blockers', async () => {
    const route = await routeOf(
      reply([
        node(2, { subIssuesSummary: { total: 2, completed: 1 } }),
        node(3, {
          stateReason: 'DUPLICATE',
          blockedBy: { nodes: [{ number: 2, state: 'CLOSED' }] },
        }),
        node(4, { state: 'OPEN', stateReason: null }),
        node(5, {
          blockedBy: {
            nodes: [
              { number: 3, state: 'CLOSED' },
              { number: 4, state: 'OPEN' },
            ],
          },
        }),
        node(6, {
          state: 'OPEN',
          stateReason: null,
          blockedBy: { nodes: [{ number: 5, state: 'CLOSED' }] },
        }),
      ]),
      '1',
    );
    expect(route.children.map((c) => [c.id, c.gate])).toEqual([
      ['3', 'ruled-out'],
      ['5', 'done'],
    ]);
    expect(route.lanes.map((d) => d.id)).toEqual(['3->5', '5->6']);
  });

  it('is empty for an issue with no sub-issues', async () => {
    const stdout = JSON.stringify({ data: { repository: { issue: null } } });
    expect(await routeOf(stdout, '9')).toEqual({ systemId: '9', children: [], lanes: [] });
  });
});
