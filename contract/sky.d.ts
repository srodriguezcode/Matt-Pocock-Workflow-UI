import type { TrackerKind } from './repo.d.ts';

export interface Label {
  name: string;
  /** Hex without `#`. Empty for `.scratch/` words. */
  color: string;
}

/** Fields every drawn issue carries. `id` keys edges: the number on GitHub, `<effort>/<NN>` in `.scratch/`. */
export interface IssueRef {
  id: string;
  /** Short handle drawn on the sky: `#613`, or `03` in `.scratch/`. */
  handle: string;
  number: number | null;
  title: string;
  url: string | null;
  /** `.scratch/` only, absolute in the main checkout: a ticket's file, or a System's effort folder. */
  path: string | null;
  labels: Label[];
}

export type Gate = 'done' | 'ruled-out' | 'in-flight' | 'blocked' | 'clear';

export type Readiness = 'ready-for-agent' | 'ready-for-human' | 'undecided' | 'none';

export type TicketKind = 'build' | 'decision';

/** How a ticket is lit. In flight wins, then Blocked, then Readiness decides. */
export type Light =
  'frontier' | 'yours' | 'decision-frontier' | 'idle' | 'in-flight' | 'undecided' | 'blocked';

export interface Claim {
  /** `null` in `.scratch/`, where no holder is recorded. */
  holder: string | null;
  since: string | null;
  ageDays: number | null;
  /** Held seven days or more. Not a Stale claim alone: `staleClaim` also checks the placed Session. */
  heldWeek: boolean;
  mine: boolean;
}

export interface Ticket extends IssueRef {
  kind: TicketKind;
  /** A Decision ticket labelled `wayfinder:research`, or with `Type: research` in local markdown. */
  research: boolean;
  /** `null` for a Loose ticket. */
  systemId: string | null;
  gate: Exclude<Gate, 'done' | 'ruled-out'>;
  readiness: Readiness;
  /** True when several triage labels disagreed and `readiness` is the most cautious. */
  readinessConflict: boolean;
  light: Light;
  claim: Claim | null;
  openBlockers: string[];
  /** Gated Systems above this ticket, nearest first (ADR 0001). */
  gatedBy: string[];
  /** Free-text `Blocked by:` values from `.scratch/`. Each gates until edited. */
  outsideBlockers: string[];
  /** Open Tickets and Systems that name this one as a direct blocker, sorted by id. */
  unblocks: string[];
  /** The Light this ticket would take at Clear, whatever its Gate is now. */
  clearLight: Extract<Light, 'frontier' | 'yours' | 'decision-frontier' | 'undecided' | 'idle'>;
  /** Set when the ticket is open but its parent is closed. */
  closedParentId: string | null;
  /** The issue its GitHub body's `## Parent` section names, whatever its real parent. */
  namedParentId: string | null;
  /** Whole days since the issue was created. `null` when the Tracker can't date it. */
  age: number | null;
  old: boolean;
  flagged: boolean;
}

export type SystemKind = 'map' | 'spec' | 'plain';

export type SystemState = 'needs-tickets' | 'live' | 'spent';

export interface System extends IssueRef {
  /** Name every view draws: the title without its kind prefix, cut at the first separator and at 30 characters. */
  name: string;
  kind: SystemKind;
  parentId: string | null;
  state: SystemState;
  /** A closed System kept because an open child is still inside it. */
  closed: boolean;
  gated: boolean;
  openBlockers: string[];
  frontierSystem: boolean;
  /** A Spec in Needs tickets with no Undecided label, Gated or not. */
  splitFrontier: boolean;
  /** Open tickets and child Systems. */
  childIds: string[];
  arc: { closed: number; total: number };
  /** From the body's `Base:` line. GitHub only. */
  base: string | null;
  /** The System's own Age, never its children's. */
  age: number | null;
  old: boolean;
  flagged: boolean;
  /** Direct open child Tickets that are Flagged. Child Systems never count, and the Map's is 0. */
  flaggedTickets: number;
}

/** A closed Ticket inside an open System, which may also be an Ember. */
export interface ClosedChild extends IssueRef {
  gate: 'done' | 'ruled-out';
}

/**
 * A closed blocker still pointed at. A closed parent with an open child is a `System` with `closed` set.
 * `labels` is empty on GitHub.
 */
export interface Ember extends IssueRef {
  gate: 'done' | 'ruled-out';
  /** Open tickets and Systems it points at. */
  blocks: string[];
}

export type DependencyKind = 'lane' | 'hyperlane';

export interface Dependency {
  id: string;
  blocker: string;
  blocked: string;
  kind: DependencyKind;
  systemToSystem: boolean;
  /** The blocker is closed, so the edge holds nothing back. */
  satisfied: boolean;
  /** The blocker is Clear or In flight. */
  hot: boolean;
}

export interface Fog {
  id: string;
  head: string;
  text: string;
}

export interface Sky {
  tracker: TrackerKind;
  /** The `gh`-authed login. `null` in `.scratch/`. */
  viewer: string | null;
  mapId: string | null;
  systems: System[];
  tickets: Ticket[];
  embers: Ember[];
  dependencies: Dependency[];
  fog: Fog[];
  destination: string | null;
  outOfScope: string[];
}
