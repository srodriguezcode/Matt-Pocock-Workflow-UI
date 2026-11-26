import { describe, expect, it } from 'vitest';
import {
  API_LIMITS_ID,
  LATE_LOAN_ID,
  LEND_BOOKS_MAP_ID,
  PORTFOLIO_PATH,
  SHELF_PATH,
} from '@app/demo/mock';
import { missingStates } from './coverage.ts';
import { readMockRepo, type MockRepo } from './mock-repo.ts';
import { snapshotRepo } from './repo-snapshot.ts';
import { buildSnapshot } from './snapshot.ts';

const READ_ISBN_ID = 'scan-barcode/02';
const WHO_CAN_BORROW_ID = 'lend-books/05';

const NOW = new Date('2026-10-01T09:00:00Z');
const LATER = new Date('2027-02-14T23:30:00Z');

async function shelfWith(change: (mock: MockRepo) => void): Promise<string[]> {
  const mock = await readMockRepo('demo', 'shelf');
  change(mock);
  return missingStates({ repos: [await snapshotRepo(mock, NOW)] });
}

const editFile = (mock: MockRepo, file: string, from: string | RegExp, to: string) => {
  const text = mock.files[file]!;
  mock.files[file] = text.replace(from, to);
  expect(mock.files[file]).not.toBe(text);
};

describe('demo snapshot', () => {
  it('shows every state on the real mocks', async () => {
    expect(missingStates(await buildSnapshot('demo', NOW))).toEqual([]);
  });

  it.each<[string, (mock: MockRepo) => void]>([
    ['Stale claim', (mock) => (mock.dates.claimed = {})],
    ['Hyperlane', (mock) => (mock.overlay.blockedBy = {})],
    ['Loose ticket', (mock) => (mock.overlay.loose = [])],
    [
      'Flagged',
      (mock) => editFile(mock, '.scratch/inbox/issues/03-sort-by-title.md', 'Flagged: yes\n', ''),
    ],
    [
      'Fog',
      (mock) => editFile(mock, '.scratch/lend-books/map.md', /## Not yet specified[^#]*/, ''),
    ],
    [
      'Yours',
      (mock) =>
        editFile(mock, '.scratch/inbox/issues/02-app-icon.md', 'ready-for-human', 'needs-info'),
    ],
  ])('names %s when the mocks lose it', async (state, change) => {
    expect(await shelfWith(change)).toContain(state);
  });

  it('keeps every Age the same on another build day', async () => {
    const ages = async (now: Date) => {
      const { sky } = (await buildSnapshot('demo', now)).repos[0]!;
      return [
        ...sky.sky.tickets.map((t) => [t.id, t.age, t.claim?.ageDays]),
        ...sky.sky.systems.map((s) => [s.id, s.age]),
      ];
    };
    expect(await ages(LATER)).toEqual(await ages(NOW));
  });

  it('holds the paths and ids the Demo code names', async () => {
    const [shelf] = (await buildSnapshot('demo', NOW)).repos;
    expect(shelf!.repo.path).toBe(SHELF_PATH);
    expect(shelf!.sky.sky.mapId).toBe(LEND_BOOKS_MAP_ID);
    expect(shelf!.sky.sky.embers.map((e) => e.id)).toContain(API_LIMITS_ID);
    const ticket = (id: string) => shelf!.sky.sky.tickets.find((t) => t.id === id);
    expect(ticket(LATE_LOAN_ID)).toMatchObject({
      gate: 'in-flight',
      claim: { ageDays: 0, heldWeek: false, mine: true },
    });
    expect(ticket(WHO_CAN_BORROW_ID)?.light).toBe('decision-frontier');
    expect(ticket('lend-books/04')?.gate).toBe('blocked');
  });

  it('reads the board after a Release of each set of claimed tickets', async () => {
    const [shelf] = (await buildSnapshot('demo', NOW)).repos;
    const claimed = [LATE_LOAN_ID, READ_ISBN_ID];
    expect(Object.keys(shelf!.releases).sort()).toEqual([...claimed, claimed.join(',')].sort());
    const both = shelf!.releases[claimed.join(',')]!;
    for (const id of claimed) {
      expect(shelf!.sky.sky.tickets.find((t) => t.id === id)?.gate).toBe('in-flight');
      expect(both.sky.sky.tickets.find((t) => t.id === id)?.claim).toBeNull();
      expect(both.refusals[id]?.reason).toMatchObject({ code: 'not-claimed' });
      expect(both.issues[id]?.body).not.toContain('Status: claimed');
    }
    expect(both.issues[READ_ISBN_ID]?.body).toContain('Status: ready-for-agent');
    const one = shelf!.releases[READ_ISBN_ID]!;
    expect(one.sky.sky.tickets.find((t) => t.id === LATE_LOAN_ID)?.gate).toBe('in-flight');
    expect(Object.keys(one.issues)).toEqual([READ_ISBN_ID]);
  });

  it('refuses a mock repo with more than three claimed tickets', async () => {
    const mock = await readMockRepo('demo', 'shelf');
    for (const file of [
      '.scratch/inbox/issues/03-sort-by-title.md',
      '.scratch/scan-barcode/issues/04-type-isbn.md',
    ])
      editFile(mock, file, /Status: \S+/, 'Status: claimed');
    await expect(snapshotRepo(mock, NOW)).rejects.toThrow(/3 at most per repo/);
  });

  it('lists the repos in Rail order', async () => {
    const { repos } = await buildSnapshot('demo', NOW);
    expect(repos.map((r) => r.repo.path)).toEqual([SHELF_PATH, PORTFOLIO_PATH]);
  });

  it('gives portfolio no Gaps, so its Spec tickets can start', async () => {
    const portfolio = (await buildSnapshot('demo', NOW)).repos[1]!;
    const ticket = portfolio.sky.sky.tickets.find((t) => t.id === 'case-studies/01')!;
    expect(portfolio.gaps.gaps).toEqual([]);
    expect(
      portfolio.plans.find((p) => p.target.kind === 'ticket' && p.target.id === ticket.id)?.result,
    ).toMatchObject({ ok: true });
  });
});
