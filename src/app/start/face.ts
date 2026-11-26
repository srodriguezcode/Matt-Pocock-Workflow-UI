import type { BaseSource, LaunchKind, StartOption } from '@contract/launch';
import type { Claim } from '@contract/sky';
import type { CodesBundle, TranslationBundle } from '@app/i18n/translation-bundle.model';
import { word } from '@app/i18n/word';
import type { Placed } from '@app/session/place';
import { staleClaim } from '@app/session/stale-claim';
import { currentStep, phase, type Launch } from '@app/start/progress';

type PillBundle = TranslationBundle['board']['pill'];
type SheetBundle = TranslationBundle['board']['sheet'];

export type PillTone = 'go' | 'off' | 'mine' | 'held' | 'bad';

export interface PillFace {
  tone: PillTone;
  text: string;
}

export function pillFace(
  option: StartOption | null,
  claim: Claim | null,
  launch: Launch | null,
  m: PillBundle,
  codes: CodesBundle,
  placed: Placed | null = null,
): PillFace | null {
  if (launch) {
    const now = phase(launch);
    if (now === 'failed') return { tone: 'bad', text: m.failed };
    if (now === 'done') return { tone: 'go', text: m.started };
    const { n, total, key } = currentStep(launch);
    const step = key ? codes.stepKeys[key] : '';
    return { tone: 'go', text: `◐ ${m.step(n, total, step)}` };
  }
  if (claim) {
    const yours = claim.mine || claim.holder === null;
    const who = yours ? m.yours : `@${claim.holder}`;
    const age = claim.ageDays === null ? '' : m.age(claim.ageDays);
    const moon = staleClaim(claim, placed) ? ' ☾' : '';
    return { tone: yours ? 'mine' : 'held', text: `● ${who}${age}${moon}` };
  }
  if (!option) return null;
  if (option.enabled) {
    return { tone: 'go', text: `▸ ${word(codes.startLabels, option.label)}` };
  }
  return { tone: 'off', text: `⊘ ${word(codes.startReasons, option.reason)}` };
}

export function sheetTitle(
  kind: LaunchKind,
  label: string,
  handle: string | null,
  codes: CodesBundle,
): string {
  if (kind === 'map') return codes.startLabels.map({ code: 'map' });
  return handle ? `${label} · ${handle}` : label;
}

export function baseNote(
  source: BaseSource,
  systemHandle: string | null,
  m: SheetBundle,
  codes: CodesBundle,
): string {
  if (source === 'system') return systemHandle ? m.baseInSystem(systemHandle) : m.baseInItsSystem;
  return codes.baseSources[source];
}
