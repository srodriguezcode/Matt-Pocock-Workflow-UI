import type { Gap, GapFix, GapTier } from '@contract/gap';
import type { GapTierNames } from '@app/i18n/translation-name-groups.model';

const TIER_ORDER: Record<GapTier, number> = { fatal: 0, start: 1, thin: 2 };

export function tierWord(names: GapTierNames, tier: GapTier): string {
  return names[tier];
}

export function sortGaps(gaps: Gap[]): Gap[] {
  return [...gaps].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
}

/** Board.gaps() plus a fatal Gap a failed read carried, deduped by id and tier-sorted. */
export function allGaps(gaps: Gap[], fatalFromRead: Gap | null): Gap[] {
  const extra =
    fatalFromRead && !gaps.some((gap) => gap.id === fatalFromRead.id) ? [fatalFromRead] : [];
  return sortGaps([...gaps, ...extra]);
}

export function fixCommand(fix: GapFix): string | null {
  return fix && 'command' in fix ? fix.command : null;
}

export function fixSkill(fix: GapFix): string | null {
  return fix && 'skill' in fix ? fix.skill : null;
}
