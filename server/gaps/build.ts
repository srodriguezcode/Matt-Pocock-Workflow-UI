import type { Gap, GapFix, GapProblem, GapTier } from '@contract/gap';
import type { LaunchKind } from '@contract/launch';

export function gap(
  id: string,
  scope: Gap['scope'],
  tier: GapTier,
  problem: GapProblem,
  fix: GapFix,
  blocks: LaunchKind[] = [],
  searched: string[] = [],
  ids: string[] = [],
): Gap {
  return { id, scope, tier, problem, fix, blocks, searched, ids };
}
