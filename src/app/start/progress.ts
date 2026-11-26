import type {
  LaunchEvent,
  LaunchPlan,
  LaunchTarget,
  StartLabel,
  StepKey,
  TakenReason,
} from '@contract/launch';
import type { CodesBundle, TranslationBundle } from '@app/i18n/translation-bundle.model';
import type { LaunchEnding } from '@app/i18n/translation-name-groups.model';
import { word } from '@app/i18n/word';

type SheetBundle = TranslationBundle['board']['sheet'];

export type StepStatus = 'waiting' | 'running' | 'done' | 'failed';

export interface Rollback {
  command: string;
  ok: boolean;
  stderr: string | null;
}

export interface Launch {
  repo: string;
  target: LaunchTarget;
  label: StartLabel;
  plan: LaunchPlan;
  steps: StepStatus[];
  current: number;
  stderr: string | null;
  taken: TakenReason | null;
  rollbacks: Rollback[];
  end: { ok: boolean; outcome: LaunchEnding } | null;
}

export type LaunchPhase = 'running' | 'done' | 'failed';

export function begin(
  repo: string,
  target: LaunchTarget,
  label: StartLabel,
  plan: LaunchPlan,
): Launch {
  return {
    repo,
    target,
    label,
    plan,
    steps: plan.steps.map(() => 'waiting'),
    current: 0,
    stderr: null,
    taken: null,
    rollbacks: [],
    end: null,
  };
}

export function advance(launch: Launch, event: LaunchEvent): Launch {
  switch (event.type) {
    case 'step': {
      const steps = launch.steps.map((s, i) => (i === event.index ? event.status : s));
      const stderr = event.status === 'failed' ? event.stderr : launch.stderr;
      return { ...launch, steps, current: event.index, stderr };
    }
    case 'taken':
      return { ...launch, taken: event.taken };
    case 'rollback':
      return {
        ...launch,
        rollbacks: [
          ...launch.rollbacks,
          { command: event.command, ok: event.ok, stderr: event.stderr },
        ],
      };
    case 'end':
      return { ...launch, end: { ok: event.ok, outcome: event.outcome } };
  }
}

export function endEarly(launch: Launch, outcome: LaunchEnding): Launch {
  const steps = launch.steps.map((s) => (s === 'running' ? 'failed' : s));
  return { ...launch, steps, end: { ok: false, outcome } };
}

export function phase(launch: Launch): LaunchPhase {
  if (!launch.end) return 'running';
  return launch.end.ok ? 'done' : 'failed';
}

export function currentStep(launch: Launch): { n: number; total: number; key: StepKey | null } {
  const key = launch.plan.steps[launch.current]?.key ?? null;
  return { n: launch.current + 1, total: launch.plan.steps.length, key };
}

export function outcome(launch: Launch, codes: CodesBundle, m: SheetBundle): string | null {
  if (!launch.end) return null;
  if (!launch.end.ok) {
    return launch.end.outcome.code === 'taken'
      ? null
      : word(codes.launchEndings, launch.end.outcome);
  }
  const claimed = launch.plan.claims.length > 0;
  if (launch.plan.tmux !== null) return claimed ? m.claimedTmux : m.tmux;
  return claimed ? m.claimedOpened : m.opened;
}

export function attachCommand(launch: Launch, m: SheetBundle): string | null {
  const { tmux } = launch.plan;
  return launch.end?.ok && tmux !== null ? m.attachCommand(tmux) : null;
}

const ICONS: Record<StepStatus, string> = { waiting: '○', running: '◐', done: '✓', failed: '✗' };

export function stepIcon(status: StepStatus): string {
  return ICONS[status];
}

export function rollbackIcon(rollback: Rollback): string {
  return rollback.ok ? '↺' : '✗';
}
