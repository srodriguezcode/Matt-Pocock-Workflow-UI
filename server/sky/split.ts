import type { StarTarget, StartOption } from '@contract/launch';

/** A Split frontier's option, disabled while a Session the board started on that Spec is live. */
export function splitOption(option: StartOption, live: StarTarget[]): StartOption {
  if (!option.enabled || option.target.kind !== 'split') return option;
  const { id } = option.target;
  const busy = live.some((t) => t.kind === 'split' && t.id === id);
  return busy ? { enabled: false, target: option.target, reason: { code: 'splitting' } } : option;
}
