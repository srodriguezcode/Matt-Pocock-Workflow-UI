import { join } from 'node:path';
import type { BranchesResponse } from '@contract/api';
import type { StartSkill } from '@contract/gap';
import type {
  LaunchPlan,
  LaunchTarget,
  PlanResult,
  PlanStep,
  SessionTarget,
  StartOption,
} from '@contract/launch';
import type { RepoConfig } from '@contract/repo';
import type { Runtime } from '@contract/runtime';
import type { IssueRef, Sky } from '@contract/sky';
import { worktreeDir } from '#server/config/store.ts';
import {
  baseCheck,
  fetchOrigin,
  openTab,
  sessionCommand,
  show,
  worktreeAdd,
  type SessionLink,
} from './commands.ts';
import { encodeTarget } from '#server/session/target.ts';
import { ticketsOf } from '#server/sky/frontier.ts';
import { splitPrompt } from './split.ts';
import { tmuxName, tmuxOpen } from './tmux.ts';

export interface PlanInput {
  sky: Sky;
  /** The target's option from the same Sky read as `sky`. An `architecture` target has none. */
  option: StartOption | undefined;
  repo: RepoConfig;
  target: LaunchTarget;
  /** The board's settings file. Null or absent leaves every Start unlinked. */
  link?: { settingsPath: string } | null;
  base: string | null;
  origin: BranchesResponse;
  /** Local branch names and worktree paths in the main checkout. */
  local: { branches: string[]; worktrees: string[] };
  /** Absent plans a Mac Start. */
  runtime?: Runtime;
  /** How the Tracker names one issue: the sheet's re-read and claim lines, and the skill's argument. */
  commands: {
    reread(id: string): string;
    claim(id: string): string;
    skillArg(ref: IssueRef, skill: StartSkill): string;
    branchSlug(ref: IssueRef): string;
  };
}

/** What a Start in the main checkout reads. It needs no Sky and claims nothing. */
type CheckoutInput = Pick<PlanInput, 'repo' | 'target' | 'link' | 'runtime'>;

/** A new session on the repo: plain `claude`, or its first message, with an optional skill before it. */
export function planSession(input: CheckoutInput & { target: SessionTarget }): PlanResult {
  const { skill, prompt } = input.target;
  const line = [skill ? `/${skill}` : '', prompt?.trim() ?? ''].filter(Boolean).join(' ');
  return mainCheckout(input, noClaims, line);
}

export function planStart(input: PlanInput): PlanResult {
  const { sky, target, option } = input;
  if (target.kind === 'session') return planSession({ ...input, target });
  if (target.kind === 'architecture') {
    return mainCheckout(input, noClaims, '/improve-codebase-architecture');
  }
  if (!option) return { ok: false, reason: { code: 'gone' } };
  if (!option.enabled) return { ok: false, reason: option.reason };
  if (option.target.kind !== target.kind)
    return { ok: false, reason: { code: 'nothing-to-start' } };
  const system = sky.systems.find((s) => s.id === target.id);
  const ticket = sky.tickets.find((t) => t.id === target.id);
  const map = sky.systems.find((s) => s.id === sky.mapId);
  const arg = input.commands.skillArg;
  const wayfinder = (...refs: IssueRef[]) =>
    `/wayfinder ${refs.map((ref) => arg(ref, 'wayfinder')).join(' ')}`;
  if (target.kind === 'map' && system) return mainCheckout(input, noClaims, wayfinder(system));
  if (target.kind === 'split' && system) {
    const prompt = splitPrompt(input.repo, sky, system);
    return mainCheckout(input, noClaims, `/to-tickets ${arg(system, 'to-tickets')}`, prompt);
  }
  if (target.kind === 'decision' && ticket && map) {
    return mainCheckout(input, claimed(input, [ticket], []), wayfinder(map, ticket));
  }
  if (target.kind === 'system' && system) {
    return inWorktree(
      input,
      system,
      ticketsOf(sky, system),
      `/implement-parallel ${arg(system, 'implement-parallel')}`,
    );
  }
  if (target.kind === 'ticket' && ticket) {
    return inWorktree(
      input,
      ticket,
      [ticket],
      `/implement-ticket ${arg(ticket, 'implement-ticket')}`,
    );
  }
  return { ok: false, reason: { code: 'nothing-to-start' } };
}

function tmuxFor(input: CheckoutInput): string | null {
  if (input.runtime !== 'container') return null;
  return tmuxName(input.repo.path, input.target);
}

function commandFor(
  input: CheckoutInput,
  cwd: string,
  skill: string,
  prompt: string | null = null,
): string {
  return sessionCommand(cwd, skill, sessionLink(input), prompt);
}

interface Claimed {
  ids: string[];
  steps: PlanStep[];
}

const noClaims: Claimed = { ids: [], steps: [] };

function mainCheckout(
  input: CheckoutInput,
  claims: Claimed,
  skill: string,
  prompt: string | null = null,
): PlanResult {
  const cwd = input.repo.path;
  const command = commandFor(input, cwd, skill, prompt);
  const tmux = tmuxFor(input);
  const plan: LaunchPlan = {
    target: input.target,
    skill,
    base: null,
    branch: null,
    worktree: null,
    reuse: { branch: false, worktree: false },
    cwd,
    command,
    tmux,
    claims: claims.ids,
    steps: [...claims.steps, terminalStep(command, tmux)],
  };
  return { ok: true, plan };
}

function inWorktree(
  input: PlanInput,
  star: IssueRef,
  claims: IssueRef[],
  skill: string,
): PlanResult {
  const { sky, repo, local } = input;
  const base = resolveBase(input, star);
  if (!input.origin.branches.includes(base.branch)) {
    return { ok: false, reason: { code: 'base-missing', branch: base.branch } };
  }
  const branch = `${prefixFor(repo, star)}/${input.commands.branchSlug(star)}`;
  const worktree = join(worktreeDir(repo), branch);
  const reuse = {
    worktree: local.worktrees.includes(worktree),
    branch: local.branches.includes(branch) || local.worktrees.includes(worktree),
  };
  const command = commandFor(input, worktree, skill);
  const tmux = tmuxFor(input);
  const baseStep: PlanStep = {
    key: 'base',
    action: { code: 'check-base', branch: base.branch },
    commands: [show(baseCheck(base.branch))],
  };
  const worktreeStep: PlanStep = reuse.worktree
    ? { key: 'worktree', action: { code: 'worktree-resume', branch }, commands: [] }
    : {
        key: 'worktree',
        action: reuse.branch
          ? { code: 'worktree-on-branch', branch }
          : { code: 'worktree-new', branch, base: base.branch },
        commands: [show(worktreeAdd(worktree, branch, reuse.branch ? null : base.branch))],
      };
  const plan: LaunchPlan = {
    target: input.target,
    skill,
    base,
    branch,
    worktree,
    reuse,
    cwd: worktree,
    command,
    tmux,
    claims: claims.map((c) => c.id),
    steps: [
      ...claimed(input, claims, [baseStep]).steps,
      { key: 'fetch', action: { code: 'fetch' }, commands: [show(fetchOrigin)] },
      ...(input.runtime === 'container' ? [pruneStep] : []),
      worktreeStep,
      terminalStep(command, tmux),
    ],
  };
  return { ok: true, plan };
}

function sessionLink({ link, repo, target }: CheckoutInput): SessionLink | null {
  if (!link || target.kind === 'architecture' || target.kind === 'session') return null;
  return { settingsPath: link.settingsPath, target: encodeTarget({ repo: repo.path, target }) };
}

function claimed(input: PlanInput, claims: IssueRef[], beforeClaim: PlanStep[]): Claimed {
  const ids = claims.map((c) => c.id);
  if (claims.length === 0) return { ids, steps: beforeClaim };
  const handles = claims.map((c) => c.handle);
  const steps: PlanStep[] = [
    {
      key: 'reread',
      action: { code: 'reread', handles },
      commands: ids.map((id) => input.commands.reread(id)),
    },
    ...beforeClaim,
    {
      key: 'claim',
      action: { code: 'claim', handles },
      commands: ids.map((id) => input.commands.claim(id)),
    },
  ];
  return { ids, steps };
}

function terminalStep(command: string, tmux: string | null): PlanStep {
  if (tmux === null) {
    return { key: 'terminal', action: { code: 'open-tab' }, commands: [show(openTab(command))] };
  }
  return {
    key: 'terminal',
    action: { code: 'open-tmux', name: tmux },
    commands: [show(tmuxOpen(tmux, command))],
  };
}

const pruneStep: PlanStep = { key: 'prune', action: { code: 'prune' }, commands: [] };

function resolveBase(input: PlanInput, star: IssueRef): NonNullable<LaunchPlan['base']> {
  const { sky, repo } = input;
  if (input.base) return { branch: input.base, source: 'override', systemId: null };
  const bySystem = new Map(sky.systems.map((s) => [s.id, s]));
  const ticket = sky.tickets.find((t) => t.id === star.id);
  let system = bySystem.get(ticket ? (ticket.systemId ?? '') : star.id);
  while (system) {
    if (system.base) return { branch: system.base, source: 'system', systemId: system.id };
    system = bySystem.get(system.parentId ?? '');
  }
  if (repo.baseBranch) return { branch: repo.baseBranch, source: 'repo', systemId: null };
  return { branch: input.origin.defaultBranch, source: 'default', systemId: null };
}

function prefixFor(repo: RepoConfig, star: IssueRef): string {
  const names = new Set(star.labels.map((l) => l.name));
  return repo.branchPrefixes.find((p) => names.has(p.label))?.prefix ?? repo.fallbackPrefix;
}
