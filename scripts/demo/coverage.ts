import type { DemoRepoSnapshot, DemoSnapshot } from '@contract/demo';
import type { System, Ticket } from '@contract/sky';
import { UNDECIDED } from '#server/sky/labels.ts';

type Holds = (repo: DemoRepoSnapshot) => boolean;

const closedGates = ({ sky, routes }: DemoRepoSnapshot) => [
  ...sky.sky.embers.map((ember) => ember.gate),
  ...Object.values(routes).flatMap((route) => route.children.map((child) => child.gate)),
];
const tickets =
  (test: (t: Ticket) => boolean): Holds =>
  ({ sky }) =>
    sky.sky.tickets.some(test);
const systems =
  (test: (s: System) => boolean): Holds =>
  ({ sky }) =>
    sky.sky.systems.some((s) => !s.closed && test(s));

const STATES: [string, Holds][] = [
  ['Done', (repo) => closedGates(repo).includes('done')],
  ['Ruled out', (repo) => closedGates(repo).includes('ruled-out')],
  ['In flight', tickets((t) => t.gate === 'in-flight')],
  ['Blocked', tickets((t) => t.gate === 'blocked')],
  ['Clear', tickets((t) => t.gate === 'clear')],
  ['Frontier', tickets((t) => t.light === 'frontier')],
  ['Yours', tickets((t) => t.light === 'yours')],
  ['Decision frontier', tickets((t) => t.light === 'decision-frontier')],
  [
    'Split frontier',
    systems(
      (s) =>
        s.kind === 'spec' &&
        s.state === 'needs-tickets' &&
        !s.labels.some((l) => (UNDECIDED as string[]).includes(l.name)),
    ),
  ],
  ['Undecided', tickets((t) => t.light === 'undecided')],
  ['Live', systems((s) => s.state === 'live')],
  ['Spent', systems((s) => s.state === 'spent')],
  ['Gated', systems((s) => s.gated)],
  ['Needs tickets', systems((s) => s.state === 'needs-tickets')],
  ['Frontier system', systems((s) => s.frontierSystem)],
  ['Old', (repo) => tickets((t) => t.old)(repo) || systems((s) => s.old)(repo)],
  ['Stale claim', tickets((t) => t.claim?.heldWeek === true)],
  ['Flagged', (repo) => tickets((t) => t.flagged)(repo) || systems((s) => s.flagged)(repo)],
  ['Fog', ({ sky }) => sky.sky.fog.length > 0],
  ['Lane', ({ sky }) => sky.sky.dependencies.some((d) => d.kind === 'lane')],
  ['Hyperlane', ({ sky }) => sky.sky.dependencies.some((d) => d.kind === 'hyperlane')],
  ['Ember', ({ sky }) => sky.sky.embers.length > 0],
  ['Loose ticket', tickets((t) => t.systemId === null)],
];

export function missingStates(snapshot: DemoSnapshot): string[] {
  return STATES.filter(([, holds]) => !snapshot.repos.some(holds)).map(([name]) => name);
}
