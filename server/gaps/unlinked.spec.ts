import { describe, expect, it } from 'vitest';
import { repo, sky, system, ticket } from '#server/launch/fixtures.ts';
import { unlinkedTickets } from './unlinked.ts';

const spec = (fields: Parameters<typeof system>[1] = {}) =>
  system('700', { state: 'needs-tickets', splitFrontier: true, ...fields });
const named = (id: string) => ticket(id, { namedParentId: '700' });
const link = (n: number) =>
  `gh api --method POST repos/me/app/issues/700/sub_issues -F sub_issue_id="$(gh api repos/me/app/issues/${n} --jq .id)"`;

describe('unlinkedTickets', () => {
  it('flags a childless Spec that Loose tickets name, with one link call per ticket', () => {
    const s = sky({ systems: [spec()], tickets: [named('801'), named('802'), ticket('803')] });
    expect(unlinkedTickets(s, repo())).toEqual([
      expect.objectContaining({
        id: 'unlinked-700',
        scope: 'repo',
        tier: 'thin',
        problem: { code: 'tickets-unlinked', handle: '#700', count: 2 },
        fix: { command: `${link(801)}\n${link(802)}` },
        blocks: [],
        ids: ['700', '801', '802'],
      }),
    ]);
  });

  it('finds nothing once the tickets are sub-issues of the Spec', () => {
    const s = sky({
      systems: [spec({ state: 'live', childIds: ['801'] })],
      tickets: [ticket('801', { systemId: '700', namedParentId: '700' })],
    });
    expect(unlinkedTickets(s, repo())).toEqual([]);
  });

  it('finds nothing for a Spec that has children', () => {
    const s = sky({
      systems: [spec({ state: 'live', childIds: ['801'] })],
      tickets: [ticket('801', { systemId: '700' }), named('802')],
    });
    expect(unlinkedTickets(s, repo())).toEqual([]);
  });

  it('finds nothing in local markdown or when the Sky read failed', () => {
    const s = sky({ tracker: 'scratch', systems: [spec()], tickets: [named('801')] });
    expect(unlinkedTickets(s, repo())).toEqual([]);
    expect(unlinkedTickets(null, repo())).toEqual([]);
  });
});
