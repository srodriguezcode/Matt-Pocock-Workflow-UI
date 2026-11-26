import type {
  LaunchEvent,
  LaunchOutcome,
  LaunchPlan,
  PlanStep,
  StepFailure,
  TakenReason,
} from '@contract/launch';
import type { CommandRunner, RunResult } from '#server/core/runner.ts';
import type { SessionHub } from '#server/session/hub.ts';
import type { Tracker } from '#server/tracker/tracker.ts';
import {
  baseCheck,
  branchDelete,
  branchExists,
  fetchOrigin,
  openTab,
  show,
  worktreeAdd,
  worktreeDetach,
  worktreeRemove,
  worktreeReset,
  type Cmd,
} from './commands.ts';
import { tmuxOpen } from './tmux.ts';

export interface ExecuteDeps {
  runner: CommandRunner;
  tracker: Tracker;
  /** The main checkout, where every git command runs. */
  checkout: string;
  sessions: Pick<SessionHub, 'launched'>;
  beforeOpen?(cwd: string): Promise<void>;
  /** It must not throw. */
  prune?(): Promise<void>;
}

export class StepFailed extends Error {
  readonly reason: StepFailure;

  constructor(reason: StepFailure) {
    super('');
    this.reason = reason;
  }
}

interface Undo {
  command: string;
  run(): Promise<string | null>;
}

export async function* executeStart(
  plan: LaunchPlan,
  deps: ExecuteDeps,
): AsyncGenerator<LaunchEvent> {
  const made: Undo[] = [];
  const exec = (cmd: Cmd) => deps.runner.run(cmd.command, cmd.args, { cwd: deps.checkout });
  const failure = (cmd: Cmd, result: RunResult): string | null =>
    result.code === 0 ? null : result.stderr.trim() || `${show(cmd)} exited ${result.code}`;
  const run = async (cmd: Cmd): Promise<void> => {
    const stderr = failure(cmd, await exec(cmd));
    if (stderr !== null) throw new Error(stderr);
  };
  const undoCmd = (cmd: Cmd): Undo => ({
    command: show(cmd),
    run: async () => failure(cmd, await exec(cmd)),
  });

  const { target } = plan;
  const rereadAction = plan.steps.find((step) => step.key === 'reread')?.action;
  const handles = rereadAction?.code === 'reread' ? rereadAction.handles : [];

  const actions: Record<PlanStep['key'], (step: PlanStep) => Promise<TakenReason | null>> = {
    reread: async () => {
      for (const [index, id] of plan.claims.entries()) {
        const taken = await deps.tracker.taken({ id, handle: handles[index]! });
        if (taken) return taken;
      }
      return null;
    },
    base: async () => {
      if (!plan.base) return null;
      const cmd = baseCheck(plan.base.branch);
      const result = await exec(cmd);
      /** `--exit-code` makes a missing head exit 2, with nothing on stderr. */
      if (result.code === 2)
        throw new StepFailed({ code: 'base-missing', branch: plan.base.branch });
      const stderr = failure(cmd, result);
      if (stderr !== null) throw new Error(stderr);
      return null;
    },
    claim: async () => {
      for (const id of plan.claims) {
        const previous = await deps.tracker.claim(id);
        made.push({
          command: deps.tracker.releaseCommand(id),
          run: async () => {
            await deps.tracker.release(id, previous);
            return null;
          },
        });
      }
      return null;
    },
    fetch: async () => {
      await run(fetchOrigin);
      return null;
    },
    prune: async () => {
      await deps.prune?.();
      return null;
    },
    worktree: async ({ action }) => {
      if (!plan.worktree) return null;
      /** A running architecture review may hold this worktree, so a failed Start leaves it in place. */
      if (action.code === 'worktree-reset') {
        for (const cmd of worktreeReset(plan.worktree, action.base)) await run(cmd);
        return null;
      }
      if (action.code === 'worktree-detach') {
        await run(worktreeDetach(plan.worktree, action.base));
        return null;
      }
      if (!plan.branch || plan.reuse.worktree) return null;
      const base = plan.reuse.branch ? null : (plan.base?.branch ?? null);
      try {
        await run(worktreeAdd(plan.worktree, plan.branch, base));
      } catch (error) {
        /** `worktree add -b` can create the branch and then fail on the checkout. */
        if (!plan.reuse.branch && (await exec(branchExists(plan.branch))).code === 0) {
          made.push(undoCmd(branchDelete(plan.branch)));
        }
        throw error;
      }
      if (!plan.reuse.branch) made.push(undoCmd(branchDelete(plan.branch)));
      made.push(undoCmd(worktreeRemove(plan.worktree)));
      return null;
    },
    terminal: async () => {
      await deps.beforeOpen?.(plan.cwd);
      const cmd = plan.tmux === null ? openTab(plan.command) : tmuxOpen(plan.tmux, plan.command);
      const result = await exec(cmd);
      const stderr = failure(cmd, result);
      if (stderr !== null) throw new Error(stderr);
      if (!('id' in target)) return null;
      /** `osascript` prints the iTerm session id, or nothing when it could not read one. */
      const terminal = plan.tmux ?? (result.stdout.trim() || null);
      deps.sessions.launched({ repo: deps.checkout, target, cwd: plan.cwd, terminal });
      return null;
    },
  };

  for (const [index, step] of plan.steps.entries()) {
    yield { type: 'step', index, key: step.key, status: 'running' };
    let taken: TakenReason | null;
    try {
      taken = await actions[step.key](step);
    } catch (error) {
      const stderr = (error as Error).message;
      yield { type: 'step', index, key: step.key, status: 'failed', stderr };
      let clean = true;
      for (const undo of made.reverse()) {
        const stderr = await undo.run().catch((e: unknown) => (e as Error).message);
        clean &&= stderr === null;
        yield { type: 'rollback', command: undo.command, ok: stderr === null, stderr };
      }
      const rollback =
        made.length === 0 ? 'nothing-changed' : clean ? 'rolled-back' : 'rollback-incomplete';
      const reason = error instanceof StepFailed ? { reason: error.reason } : {};
      yield {
        type: 'end',
        ok: false,
        outcome: { code: 'step-failed', action: step.action, rollback, ...reason },
      };
      return;
    }
    if (taken) {
      yield { type: 'taken', taken };
      yield { type: 'end', ok: false, outcome: { code: 'taken', taken } };
      return;
    }
    yield { type: 'step', index, key: step.key, status: 'done' };
  }
  const outcome: LaunchOutcome = { code: 'opened', command: plan.command };
  yield { type: 'end', ok: true, outcome };
}
