import type { StarTarget, StartOption } from '@contract/launch';
import { splitOption } from './split.ts';

export interface BoardScope {
  live: { repo: string; target: StarTarget }[];
  repo: string;
}

/** Live Sessions in this repo disable a Split frontier. */
export function boardStarts(
  starts: Record<string, StartOption>,
  { live, repo }: BoardScope,
): Record<string, StartOption> {
  const here = live.filter((l) => l.repo === repo).map((l) => l.target);
  const shown: Record<string, StartOption> = {};
  for (const [id, option] of Object.entries(starts)) {
    shown[id] = option.target?.kind === 'split' ? splitOption(option, here) : option;
  }
  return shown;
}
