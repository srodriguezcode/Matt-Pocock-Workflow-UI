import type { CostReading, CostShortfall, TokenCounts } from '@contract/cost';
import { dollarsOf } from './prices.ts';
import type { AttributedSession, CostMember } from './session.ts';

export function costReading(
  id: string,
  members: CostMember[],
  sessions: AttributedSession[],
): CostReading {
  const ids = new Set(members.map((member) => member.id));
  const counted = sessions.filter((s) => s.issueId !== null && ids.has(s.issueId));
  const tokens: TokenCounts = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
  const unpriced = new Set<string>();
  let dollars = 0;
  let workingMs = 0;
  for (const session of counted) {
    workingMs += session.workingMs;
    for (const usage of session.usage) {
      tokens.input += usage.input;
      tokens.output += usage.output;
      tokens.cacheCreation += usage.cacheCreation;
      tokens.cacheRead += usage.cacheRead;
      const cost = dollarsOf(usage);
      if (cost === null) unpriced.add(usage.model);
      else dollars += cost;
    }
  }
  const seen = new Set(counted.map((s) => s.issueId));
  const byId = new Map(members.map((m) => [m.id, m]));
  const agedOut = members.filter((m) => agedOutOf(m, byId, seen)).map((m) => m.handle);
  const partial: CostShortfall[] = [];
  if (agedOut.length > 0) partial.push({ code: 'aged-out', handles: agedOut });
  if (unpriced.size > 0) partial.push({ code: 'no-price', models: [...unpriced].sort() });
  return { id, sessions: counted.length, tokens, dollars, workingMs, partial };
}

/**
 * A Frontier system Start counts toward the System alone, so a ticket it ran has no Session.
 * Only a closed ticket that ran, with no Session on it or on any System above it, has aged out.
 */
function agedOutOf(
  member: CostMember,
  byId: Map<string, CostMember>,
  seen: Set<string | null>,
): boolean {
  if (!member.closed || member.system || !ran(member)) return false;
  for (let at: CostMember | undefined = member; at; at = byId.get(at.parentId ?? '')) {
    if (seen.has(at.id)) return false;
  }
  return true;
}

function ran(member: CostMember): boolean {
  return member.closeReason !== 'not-planned' && member.closeReason !== 'duplicate';
}
