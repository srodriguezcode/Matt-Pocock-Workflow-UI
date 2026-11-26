import type {
  ClearLightWording,
  CostShortfallWording,
  StarPlace,
  StarPlaceWording,
  TokenKindNames,
} from '@app/i18n/translation-name-groups.model';
import { word } from '@app/i18n/word';

const list = (items: string[]) => items.join(', ');
const goesClear = (a: string, b: string, then = '') =>
  `${a} is the only thing holding ${b}. Close it and ${b} goes Clear${then}.`;
const onlyHoldingGoesClear: ClearLightWording = {
  frontier: (a, b) => goesClear(a, b, ' and joins the Frontier'),
  'decision-frontier': (a, b) => goesClear(a, b, ' and becomes a Decision frontier'),
  yours: goesClear,
  undecided: goesClear,
  idle: goesClear,
};

const unlocks = (count: number) => (count > 0 ? ` Unlocks ${count}.` : '');

const quoted = (text: string) => `“${text}”`;

const places: StarPlaceWording = {
  system: () => 'a System',
  closed: () => 'closed',
  loose: () => 'a Loose ticket',
  'in-system': ({ system }) => `in ${system}`,
};

const inside = (place: StarPlace) =>
  place.code === 'in-system' ? place.system : word(places, place);

const holder = (handle: string | null) => (handle ? `@${handle}` : 'you');

const shortfalls: CostShortfallWording = {
  'aged-out': ({ handles }) => `transcripts aged out for ${list(handles)}`,
  'no-price': ({ models }) => `no price for ${list(models)}`,
};

const tokenKinds: TokenKindNames = {
  input: 'Input',
  output: 'Output',
  cacheCreation: 'Cache creation',
  cacheRead: 'Cache read',
};

const workingFor = (ms: number) => {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
};

const claimed = (handle: string | null, ageDays: number | null) =>
  `Claimed by ${holder(handle)}${ageDays === null ? '' : ` · ${ageDays} d`}`;

export const panel = {
  close: 'Close',
  noLabels: 'No labels',
  source: 'Open on GitHub ↗',
  loading: 'Loading…',
  commentsHeading: (count: number) => `Comments · ${count}`,
  issueLoadFailed: (reason: string) => `Couldn't load the issue: ${reason}`,
  releaseFailed: (reason: string) => `Release failed: ${reason}`,
  releaseItemFailed: (handle: string, reason: string) => `Couldn't release ${handle}: ${reason}`,

  ticket: {
    frontier: (count: number) => `Frontier: clear, ready for an agent.${unlocks(count)}`,
    decisionFrontier: (count: number) =>
      `Decision frontier: the next decision on the Map.${unlocks(count)}`,
    yours: (count: number) => `Yours: clear, ready for a human. No Start.${unlocks(count)}`,
    inFlight: (count: number) => `In flight.${unlocks(count)}`,
    undecided: 'Undecided until someone triages it.',
    idle: 'Clear, but it has no readiness label.',
    blockedBy: (handles: string[], outside: string[]) =>
      `Blocked by ${list([...handles, ...outside.map(quoted)])}.`,
    blocked: 'Blocked.',
    blockedThroughSystem: (system: string, blockers: string[]) =>
      `Blocked through its system: ${system} is gated by ${list(blockers)}.`,
    outsideBlockerNote: (text: string) =>
      `Outside blocker: ${quoted(text)}. It holds the ticket until someone edits the line.`,
    closedParentNote: (handle: string) =>
      `Its parent ${handle} is closed, yet this ticket is still open.`,
    claimedByYou: (count: number) =>
      `${count} ${count === 1 ? 'ticket' : 'tickets'} claimed by you`,
    release: 'Release',
    releaseCount: (count: number) => `Release ${count}`,
    staleClaim: 'Stale claim',
  },

  system: {
    closed: 'Closed, with an open ticket still inside it.',
    mapNoDecision: 'The Map. No decision on its frontier.',
    mapDecisions: (refs: string[]) =>
      `The Map. ${refs.length} ${refs.length === 1 ? 'decision' : 'decisions'} on its frontier: ${list(refs)}.`,
    gated: (refs: string[], tickets: number) =>
      `Gated by ${list(refs)}: ${tickets === 1 ? 'its 1 ticket reads' : `all ${tickets} tickets read`} as Blocked.`,
    needsTickets: "Needs tickets: /to-tickets hasn't run yet.",
    spent: 'Spent: every ticket is closed.',
    live: (
      total: number,
      frontier: number,
      blocked: number,
      inFlight: number,
      frontierSystem: boolean,
    ) =>
      `${total} open: ${frontier} on the frontier, ${blocked} blocked, ${inFlight} in flight.` +
      (frontierSystem ? ' A Frontier system.' : ''),
  },

  ember: {
    ruledOut: 'Ruled out.',
    done: 'Done.',
  },

  conflictNote: (winner: string) => `labels conflict: ${winner} wins`,

  flag: {
    flag: 'Flag',
    unflag: 'Unflag',
    flaggedTickets: (count: number) => `Flagged tickets: ${count}`,
    failed: "Couldn't save the flag.",
  },

  claim: {
    line: claimed,
    staleRow: (handle: string | null, ageDays: number | null) =>
      `${claimed(handle, ageDays)} · stale`,
    releaseOnly: (holder: string) => `only @${holder} can release`,
  },

  groups: {
    frontier: 'Ready for an agent',
    decisions: 'Next decisions',
    yours: 'Ready for a human',
  },

  relation: {
    satisfiedTitle: 'Satisfied',
    hyperlaneTitle: 'Hyperlane',
    laneTitle: 'Lane',
    satisfied: (a: string, b: string) => `${a} is closed, so this no longer holds ${b} back.`,
    systemToSystem: (a: string, b: string) => `${a} blocks ${b}, system to system.`,
    systemGatedAll: (system: string, count: number) =>
      `${system} is Gated, so all ${count} open ${count === 1 ? 'ticket' : 'tickets'} in it read as Blocked, whatever their own edges say (ADR 0001).`,
    gateLifts: (a: string) => `The gate lifts when the issue ${a} closes, not when its tickets do.`,
    blocksWholeOf: (a: string, b: string) => `${a} blocks the whole of ${b}.`,
    systemGatedUntil: (system: string, a: string) =>
      `${system} is Gated: every ticket in it reads as Blocked until ${a} closes.`,
    stillGated: (a: string, refs: string[]) =>
      `Closing ${a} alone won't lift the gate: ${list(refs)} still block it.`,
    blocksWaits: (blocker: string, blocked: string, until: string) =>
      `${blocker} blocks ${blocked}, which waits for ${until} to close.`,
    hyperlaneBoth: (a: string, placeA: StarPlace, b: string, placeB: StarPlace) =>
      `${a} (${word(places, placeA)}) blocks ${b} (${word(places, placeB)}).`,
    laneInside: (a: string, b: string, place: StarPlace) =>
      `${a} blocks ${b} inside ${inside(place)}.`,
    stillHoldingOthers: (
      a: string,
      b: string,
      others: { handles: string[]; gated: { handle: string; system: string }[]; outside: string[] },
    ) =>
      `Closing ${a} alone doesn't free ${b}: ${list([
        ...others.handles,
        ...others.gated.map((g) => `${g.handle} (${g.system} is Gated)`),
        ...others.outside.map(quoted),
      ])} still hold it.`,
    onlyHolding: (a: string, b: string) => `${a} is the only thing holding ${b}.`,
    onlyHoldingGoesClear,
  },

  dependency: {
    blocker: 'Blocker',
    blocked: 'Blocked',
    state: 'State',
    satisfiedState: 'satisfied: the blocker is closed',
    gatingState: 'gating: the blocker is open',
  },

  fog: {
    heading: 'Fog',
    note: "Not yet specified, from the Map's body.",
  },

  offsky: {
    closedSuffix: '(closed)',
    notOnSkyClosed: 'Not on the sky: closed, and nothing open points at it.',
    notOnSky: 'Not on the sky.',
  },

  gone: {
    closedSuffix: '(closed)',
    goneClosed: 'No longer on the sky: closed, and nothing open points at it.',
    goneUnknown: 'No longer on the sky: closed or moved, and nothing open points at it.',
  },

  frontierSection: {
    heading: 'Frontier',
    empty: 'Nothing on its frontier.',
    unlocks: (count: number) => ` · unlocks ${count}`,
  },

  destination: {
    heading: 'Destination',
  },

  outOfScope: {
    heading: 'Out of scope',
  },

  details: {
    kind: 'Kind',
    gate: 'Gate',
    readiness: 'Readiness',
    system: 'System',
    looseTicket: 'Loose ticket',
    blockedBy: 'Blocked by',
    inherited: 'Inherited',
    unblocks: 'Unblocks',
    claim: 'Claim',
    none: '—',
    shape: 'Shape',
    state: 'State',
    stateClosed: 'Closed',
    stateGated: 'Gated',
    tickets: 'Tickets',
    ticketsCount: (open: number, closed: number) => `${open} open · ${closed} closed`,
    base: 'Base',
    blocks: 'Blocks',
    age: 'Age',
    ageDays: (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`,
  },

  cost: {
    cost: 'Cost',
    workingTime: 'Working time',
    loading: 'Reading transcripts…',
    failed: (reason: string) => `Couldn't read the Cost: ${reason}`,
    none: 'No Sessions counted',
    tokens: (total: number) => `${total.toLocaleString('en')} tokens`,
    dollars: (amount: number) => `$${amount.toFixed(2)}`,
    workingFor,
    tokenKinds,
    tokenLine: (kind: string, count: number) => `${kind}: ${count.toLocaleString('en')}`,
    partial: 'partial',
    shortfalls,
  },
};
