import type { StartOption } from '@contract/launch';
import type {
  Claim,
  ClosedChild,
  Dependency,
  Ember,
  Fog,
  Light,
  System,
  Ticket,
} from '@contract/sky';
import type { CodesBundle, TranslationBundle } from '@app/i18n/translation-bundle.model';
import type { StarPlace } from '@app/i18n/translation-name-groups.model';
import type { Placed } from '@app/session/place';
import { staleClaim } from '@app/session/stale-claim';
import type { RoutedSky, Star } from '@app/sky/engine/route';
import type { Selection } from '@app/sky/engine/types';

type PanelText = TranslationBundle['board']['panel'];

interface Ref {
  id: string;
  handle: string;
  title: string;
}

interface SystemRef extends Ref {
  name: string;
}

interface ClaimReading {
  line: string;
  row: string;
  releaseNote: string | null;
  stale: boolean;
  mine: boolean;
}

interface FrontierGroup {
  title: string;
  tickets: (Ref & { unlocks: string | null })[];
}

interface FlagToggle {
  toggle: string;
  next: boolean;
}

interface MyClaims {
  ids: string[];
  claimed: string;
  release: string;
}

export type Reading =
  | {
      kind: 'ticket';
      issue: Ticket;
      sentence: string;
      kindName: string;
      gate: string;
      system: SystemRef | null;
      claim: ClaimReading | null;
      conflictNote: string | null;
      readiness: string;
      age: string | null;
      blockedBy: Ref[];
      inherited: Ref[];
      unblocks: Ref[];
      outsideNotes: string[];
      closedParentNote: string | null;
      flag: FlagToggle;
    }
  | {
      kind: 'system';
      issue: System;
      sentence: string;
      shape: string;
      state: string;
      tickets: string;
      age: string | null;
      blockedBy: Ref[];
      frontier: FrontierGroup[];
      mine: MyClaims | null;
      flag: FlagToggle | null;
      flaggedTickets: string | null;
    }
  | { kind: 'ember'; issue: Ember; sentence: string; gate: string; blocks: Ref[] }
  | { kind: 'closed'; issue: ClosedChild; sentence: string; gate: string; system: SystemRef }
  | {
      kind: 'line';
      title: string;
      state: string;
      lines: string[];
      blocker: Ref;
      blocked: Ref;
    }
  | { kind: 'fog'; fog: Fog }
  | { kind: 'off-sky'; id: string }
  | { kind: 'gone' }
  | { kind: 'none' };

interface ReadingInput {
  sky: RoutedSky | null;
  selection: Selection;
  offsky: string | null;
  /** The server's raw options, before any Gap disables them. */
  starts: Record<string, StartOption>;
  sessions: ReadonlyMap<string, Placed>;
  text: PanelText;
  codes: CodesBundle;
}

export function readSelection(input: ReadingInput): Reading {
  const { sky, selection, offsky } = input;
  if (offsky !== null) return { kind: 'off-sky', id: offsky };
  if (selection === null) return { kind: 'none' };
  const found = sky ? readOnSky(sky, selection, input) : null;
  return found ?? { kind: 'gone' };
}

function readOnSky(
  sky: RoutedSky,
  selection: NonNullable<Selection>,
  input: ReadingInput,
): Reading | null {
  if (selection.kind === 'line') {
    const dependency = sky.dependencies.find((d) => d.id === selection.id);
    return dependency ? readLine(sky, dependency, input.text) : null;
  }
  if (selection.kind === 'fog') {
    const fog = sky.fog.find((f) => f.id === selection.id);
    return fog ? { kind: 'fog', fog } : null;
  }
  const star = findStar(sky, selection.id);
  switch (star?.kind) {
    case 'ticket':
      return readTicket(sky, star.ticket, input);
    case 'system':
      return readSystem(sky, star.system, input);
    case 'ember':
      return {
        kind: 'ember',
        issue: star.ember,
        sentence: emberSentence(star.ember, input.text),
        gate: input.codes.gates[star.ember.gate],
        blocks: refs(sky, star.ember.blocks),
      };
    case 'closed':
      return {
        kind: 'closed',
        issue: star.child,
        sentence: emberSentence(star.child, input.text),
        gate: input.codes.gates[star.child.gate],
        system: systemRef(sky, star.system),
      };
    default:
      return null;
  }
}

function findStar(sky: RoutedSky, id: string): Star | null {
  return sky.index.get(id)?.star ?? null;
}

function systemOf(sky: RoutedSky, id: string | null | undefined): System | null {
  const star = id ? findStar(sky, id) : null;
  return star?.kind === 'system' ? star.system : null;
}

export function handleIn(sky: RoutedSky | null, id: string): string {
  return sky?.index.get(id)?.ref.handle ?? `#${id}`;
}

function refOf(sky: RoutedSky, id: string): Ref {
  return { id, handle: handleIn(sky, id), title: sky.index.get(id)?.ref.title ?? '' };
}

function systemRef(sky: RoutedSky, system: System): SystemRef {
  return { ...refOf(sky, system.id), name: system.name };
}

function refs(sky: RoutedSky, ids: string[]): Ref[] {
  return ids.map((id) => refOf(sky, id));
}

function handles(sky: RoutedSky, ids: string[]): string[] {
  return ids.map((id) => refOf(sky, id).handle);
}

function ticketsIn(sky: RoutedSky, systemId: string): Ticket[] {
  return sky.tickets.filter((t) => t.systemId === systemId);
}

function readTicket(sky: RoutedSky, ticket: Ticket, input: ReadingInput): Reading {
  const { text: t, codes } = input;
  const home = homeSystem(sky, ticket);
  return {
    kind: 'ticket',
    issue: ticket,
    sentence: ticketSentence(ticket, input.starts[ticket.id] ?? null, t),
    kindName: codes.ticketKinds[ticket.kind],
    gate: codes.gates[ticket.gate],
    system: home ? systemRef(sky, home) : null,
    claim: ticket.claim
      ? readClaim(ticket.claim, staleClaim(ticket.claim, input.sessions.get(ticket.id)), t)
      : null,
    conflictNote: ticket.readinessConflict
      ? t.conflictNote(codes.readiness[ticket.readiness])
      : null,
    readiness: codes.readiness[ticket.readiness],
    age: ageOf(ticket.age, t),
    blockedBy: refs(sky, ticket.openBlockers),
    inherited: refs(sky, ticket.gatedBy),
    unblocks: refs(sky, ticket.unblocks),
    outsideNotes: ticket.outsideBlockers.map((text) => t.ticket.outsideBlockerNote(text)),
    closedParentNote:
      ticket.closedParentId === null
        ? null
        : t.ticket.closedParentNote(refOf(sky, ticket.closedParentId).handle),
    flag: flagToggle(ticket.flagged, t),
  };
}

/** A plain `.scratch/` effort has no `map.md` or `spec.md` to hold the line. */
function flaggable(sky: RoutedSky, system: System): boolean {
  return !system.closed && !(sky.tracker === 'scratch' && system.kind === 'plain');
}

function flagToggle(flagged: boolean, t: PanelText): FlagToggle {
  return { toggle: flagged ? t.flag.unflag : t.flag.flag, next: !flagged };
}

function ageOf(days: number | null, t: PanelText): string | null {
  return days === null ? null : t.details.ageDays(days);
}

function ticketSentence(ticket: Ticket, option: StartOption | null, t: PanelText): string {
  const unblocks = ticket.unblocks.length;
  switch (ticket.light) {
    case 'frontier':
      return t.ticket.frontier(unblocks);
    case 'decision-frontier':
      return t.ticket.decisionFrontier(unblocks);
    case 'yours':
      return t.ticket.yours(unblocks);
    case 'in-flight':
      return t.ticket.inFlight(unblocks);
    case 'blocked':
      return blockedSentence(option, t);
    case 'undecided':
      return t.ticket.undecided;
    case 'idle':
      return t.ticket.idle;
  }
}

function blockedSentence(option: StartOption | null, t: PanelText): string {
  const reason = option && !option.enabled ? option.reason : null;
  if (reason?.code === 'blocked-by' && reason.blockers.length + reason.outside.length > 0) {
    return t.ticket.blockedBy(reason.blockers, reason.outside);
  }
  if (reason?.code === 'gated')
    return t.ticket.blockedThroughSystem(reason.system, reason.blockers);
  return t.ticket.blocked;
}

function readClaim(claim: Claim, stale: boolean, t: PanelText): ClaimReading {
  const line = t.claim.line(claim.holder, claim.ageDays);
  return {
    line,
    row: stale ? t.claim.staleRow(claim.holder, claim.ageDays) : line,
    releaseNote: !claim.mine && claim.holder ? t.claim.releaseOnly(claim.holder) : null,
    stale,
    mine: claim.mine,
  };
}

function readSystem(sky: RoutedSky, system: System, input: ReadingInput): Reading {
  const { text: t, codes } = input;
  const tickets = ticketsIn(sky, system.id);
  return {
    kind: 'system',
    issue: system,
    sentence: systemSentence(sky, system, tickets, t),
    shape: codes.systemKinds[system.kind],
    state: system.closed
      ? t.details.stateClosed
      : system.gated
        ? t.details.stateGated
        : codes.systemStates[system.state],
    tickets: t.details.ticketsCount(tickets.length, system.arc.closed),
    age: ageOf(system.age, t),
    blockedBy: refs(sky, system.openBlockers),
    frontier: frontierGroups(tickets, t),
    mine: myClaims(tickets, t),
    flag: flaggable(sky, system) ? flagToggle(system.flagged, t) : null,
    flaggedTickets: system.flaggedTickets > 0 ? t.flag.flaggedTickets(system.flaggedTickets) : null,
  };
}

function myClaims(tickets: Ticket[], t: PanelText): MyClaims | null {
  const ids = tickets.filter((tk) => tk.claim?.mine).map((tk) => tk.id);
  if (ids.length === 0) return null;
  return {
    ids,
    claimed: t.ticket.claimedByYou(ids.length),
    release: t.ticket.releaseCount(ids.length),
  };
}

function systemSentence(sky: RoutedSky, system: System, tickets: Ticket[], t: PanelText): string {
  if (system.closed) return t.system.closed;
  const lit = (light: Light) => tickets.filter((tk) => tk.light === light);
  if (system.kind === 'map') {
    const next = lit('decision-frontier');
    if (next.length === 0) return t.system.mapNoDecision;
    return t.system.mapDecisions(
      handles(
        sky,
        next.map((tk) => tk.id),
      ),
    );
  }
  if (system.gated) return t.system.gated(handles(sky, system.openBlockers), tickets.length);
  if (system.state === 'needs-tickets') return t.system.needsTickets;
  if (system.state === 'spent') return t.system.spent;
  return t.system.live(
    tickets.length,
    lit('frontier').length,
    lit('blocked').length,
    lit('in-flight').length,
    system.frontierSystem,
  );
}

function frontierGroups(tickets: Ticket[], t: PanelText): FrontierGroup[] {
  const groups: [Light, string][] = [
    ['frontier', t.groups.frontier],
    ['decision-frontier', t.groups.decisions],
    ['yours', t.groups.yours],
  ];
  return groups
    .map(([light, title]) => ({
      title,
      tickets: tickets
        .filter((tk) => tk.light === light)
        .sort((a, b) => b.unblocks.length - a.unblocks.length || (a.number ?? 0) - (b.number ?? 0))
        .map((tk) => ({
          id: tk.id,
          handle: tk.handle,
          title: tk.title,
          unlocks: tk.unblocks.length > 0 ? t.frontierSection.unlocks(tk.unblocks.length) : null,
        })),
    }))
    .filter((g) => g.tickets.length > 0);
}

function emberSentence(closed: Ember | ClosedChild, t: PanelText): string {
  return closed.gate === 'ruled-out' ? t.ember.ruledOut : t.ember.done;
}

function readLine(sky: RoutedSky, dep: Dependency, t: PanelText): Reading {
  const title = dep.satisfied
    ? t.relation.satisfiedTitle
    : dep.kind === 'hyperlane'
      ? t.relation.hyperlaneTitle
      : t.relation.laneTitle;
  return {
    kind: 'line',
    title,
    state: dep.satisfied ? t.dependency.satisfiedState : t.dependency.gatingState,
    lines: relationLines(sky, dep, t),
    blocker: refOf(sky, dep.blocker),
    blocked: refOf(sky, dep.blocked),
  };
}

function relationLines(sky: RoutedSky, dep: Dependency, t: PanelText): string[] {
  const a = refOf(sky, dep.blocker).handle;
  const b = refOf(sky, dep.blocked).handle;
  if (dep.satisfied) return [t.relation.satisfied(a, b)];
  const blocker = findStar(sky, dep.blocker);
  const blocked = findStar(sky, dep.blocked);
  const named = (star: Star | null, handle: string) =>
    star?.kind === 'system' ? `${star.system.name} (${handle})` : handle;
  const A = named(blocker, a);
  const B = named(blocked, b);

  if (blocked?.kind === 'system') {
    const lines: string[] = [];
    const name = blocked.system.name;
    if (blocker?.kind === 'system') {
      lines.push(t.relation.systemToSystem(A, B));
      lines.push(t.relation.systemGatedAll(name, ticketsIn(sky, blocked.system.id).length));
      lines.push(t.relation.gateLifts(a));
    } else {
      lines.push(t.relation.blocksWholeOf(A, B));
      lines.push(t.relation.systemGatedUntil(name, a));
    }
    const others = blocked.system.openBlockers.filter((id) => id !== dep.blocker);
    if (others.length > 0) lines.push(t.relation.stillGated(a, handles(sky, others)));
    return lines;
  }

  const first =
    blocker?.kind === 'system'
      ? t.relation.blocksWaits(A, b, a)
      : dep.kind === 'hyperlane'
        ? t.relation.hyperlaneBoth(a, placeOf(sky, blocker), b, placeOf(sky, blocked))
        : t.relation.laneInside(a, b, placeOf(sky, blocked));
  if (blocked?.kind !== 'ticket') return [first];
  return [first, stillHolding(sky, blocked.ticket, dep.blocker, t)];
}

function placeOf(sky: RoutedSky, star: Star | null): StarPlace {
  if (star?.kind !== 'ticket') {
    return { code: star?.kind === 'ember' || star?.kind === 'closed' ? 'closed' : 'system' };
  }
  const home = homeSystem(sky, star.ticket);
  return home ? { code: 'in-system', system: home.name } : { code: 'loose' };
}

function homeSystem(sky: RoutedSky, ticket: Ticket): System | null {
  return systemOf(sky, sky.index.get(ticket.id)?.home);
}

function stillHolding(sky: RoutedSky, ticket: Ticket, blockerId: string, t: PanelText): string {
  const a = refOf(sky, blockerId).handle;
  const b = ticket.handle;
  const gated = ticket.gatedBy
    .filter((id) => id !== blockerId)
    .map((id) => systemOf(sky, id))
    .filter((system) => system !== null)
    .map((system) => ({ handle: system.handle, system: system.name }));
  const others = {
    handles: handles(
      sky,
      ticket.openBlockers.filter((id) => id !== blockerId),
    ),
    gated,
    outside: ticket.outsideBlockers,
  };
  if (others.handles.length + others.gated.length + others.outside.length > 0) {
    return t.relation.stillHoldingOthers(a, b, others);
  }
  if (ticket.gate === 'in-flight') return t.relation.onlyHolding(a, b);
  return t.relation.onlyHoldingGoesClear[ticket.clearLight](a, b);
}
