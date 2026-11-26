import type {
  ApiErrorWording,
  BaseSourceNames,
  GapProblemWording,
  GapTierNames,
  GateNames,
  LaunchEndingWording,
  PlanRefusalWording,
  ReadinessNames,
  ReleaseRefusalWording,
  RollbackResultNames,
  StartLabelWording,
  StartReasonWording,
  StartSkillNames,
  StepActionWording,
  StepFailureWording,
  StepKeyNames,
  SystemKindNames,
  SystemStateNames,
  TakenReasonWording,
  TicketKindNames,
} from '@app/i18n/translation-name-groups.model';
import { word } from '@app/i18n/word';

const list = (items: string[]) => items.join(', ');

/**
 * Each group is annotated apart from the bundle: the annotation makes a missing arm a compile
 * error and keeps the derived contract's leaves `string` rather than the English literal.
 */
const gates: GateNames = {
  done: 'Done',
  'ruled-out': 'Ruled out',
  'in-flight': 'In flight',
  blocked: 'Blocked',
  clear: 'Clear',
};

const readiness: ReadinessNames = {
  'ready-for-agent': 'ready-for-agent',
  'ready-for-human': 'ready-for-human',
  undecided: 'Undecided',
  none: '—',
};

const systemStates: SystemStateNames = {
  'needs-tickets': 'Needs tickets',
  live: 'Live',
  spent: 'Spent',
};

const systemKinds: SystemKindNames = {
  map: 'System · Map',
  spec: 'System · Spec',
  plain: 'System',
};

const ticketKinds: TicketKindNames = {
  build: 'Build ticket',
  decision: 'Decision ticket',
};

const gapTiers: GapTierNames = {
  fatal: 'No sky',
  start: 'Blocks Start',
  thin: 'Thins the sky',
};

const stepKeys: StepKeyNames = {
  reread: 'reread',
  base: 'base',
  claim: 'claim',
  fetch: 'fetch',
  prune: 'prune',
  worktree: 'worktree',
  terminal: 'terminal',
};

const baseSources: BaseSourceNames = {
  system: 'its system',
  repo: 'repo config',
  default: 'default branch',
  override: 'this Start only',
};

const skillEffects: StartSkillNames = {
  implement: 'Start on a Frontier ticket or system has nothing to run.',
  'implement-ticket': 'Start on a Frontier ticket has nothing to run.',
  'implement-parallel': 'Start on a Frontier system has nothing to run.',
  wayfinder: 'Start on a decision or the Map has nothing to run.',
  'to-tickets': 'Start on a Split frontier Spec has nothing to run.',
  'improve-codebase-architecture': 'The architecture review has nothing to run.',
};

const rollbackResults: RollbackResultNames = {
  'nothing-changed': 'Nothing changed.',
  'rolled-back': 'Rolled back.',
  'rollback-incomplete': 'Rollback incomplete.',
};

const gapTitles: GapProblemWording = {
  'gh-missing': () => 'gh is not installed',
  'gh-unauthed': () => 'gh is not logged in',
  'git-missing': () => 'git is not installed',
  'claude-missing': () => 'claude is not installed',
  'iterm-missing': () => 'iTerm2 is not installed',
  'tracker-missing': ({ file }) => `${file} is missing`,
  'tracker-unsupported': () => 'tracker not supported',
  'labels-missing': () => 'canonical labels missing',
  'sub-issues-deps': () => 'sub-issues or dependencies unavailable',
  'skill-missing': ({ skill }) => `/${skill} is not installed`,
  'base-off-origin': ({ handle }) => `Base on ${handle} points off origin`,
  'tickets-unlinked': ({ handle }) => `Tickets of ${handle} are not its sub-issues`,
};

const gapEffects: GapProblemWording = {
  'gh-missing': () => 'No sky for any repo.',
  'gh-unauthed': () => 'No sky for any repo.',
  'git-missing': () => 'No sky for any repo.',
  'claude-missing': () => 'Start is disabled everywhere.',
  'iterm-missing': () => 'Start is disabled everywhere.',
  'tracker-missing': () => 'No sky for this repo.',
  'tracker-unsupported': () => 'No sky for this repo.',
  'labels-missing': () => 'Tickets that need them read thinner.',
  'sub-issues-deps': () => 'Systems and Lanes read thinner.',
  'skill-missing': ({ skill }) => skillEffects[skill],
  'base-off-origin': ({ handle }) =>
    `A Start on ${handle} or its tickets stops at the Base check unless you pick another Base.`,
  'tickets-unlinked': ({ handle, count }) =>
    `${count === 1 ? 'Its ticket shows as a Loose ticket' : `Its ${count} tickets show as Loose tickets`}, and ${handle} stays a Split frontier.`,
};

const startLabels: StartLabelWording = {
  ticket: () => 'Start',
  decision: () => 'Start decision',
  map: () => 'Start the map',
  system: ({ count }) => `Start all ${count}`,
  split: () => 'Split into tickets',
  architecture: () => 'Review architecture',
  session: () => 'New session',
};

const startReasons: StartReasonWording = {
  'no-map': () => 'no Map',
  'off-map': () => 'not on the Map',
  'in-flight': ({ holder, mine }) =>
    mine ? 'in flight: yours' : holder ? `in flight: @${holder}` : 'in flight',
  undecided: ({ label }) => (label ? `undecided: ${label}` : 'undecided'),
  'blocked-by': ({ blockers, outside }) => `blocked by ${list([...blockers, ...outside])}`,
  gated: ({ blockers, system }) => `gated: ${list(blockers)} blocks ${system}`,
  'ready-for-human': () => "ready-for-human: yours, not an agent's",
  'no-readiness': () => 'no readiness label',
  'no-decision-frontier': () => 'no decision frontier',
  'no-tickets': () => 'no tickets yet',
  spent: () => 'every ticket is closed',
  'system-gated': ({ blockers }) => `gated by ${list(blockers)}`,
  'child-system': ({ handle }) => `${handle} is a System`,
  'ticket-in-flight': ({ handle }) => `${handle} is in flight`,
  'ticket-decision': ({ handle }) => `${handle} is a decision ticket`,
  'ticket-undecided': ({ handle }) => `${handle} is undecided`,
  'ticket-ready-for-human': ({ handle }) => `${handle} is ready-for-human`,
  'ticket-no-readiness': ({ handle }) => `${handle} has no readiness label`,
  'blocked-from-outside': ({ handle, blockers }) =>
    `${handle} is blocked from outside by ${list(blockers)}`,
  'not-frontier-system': () => 'not a Frontier system',
  splitting: () => 'a Session is splitting it now',
  gap: ({ problem }) => `Gap: ${word(gapTitles, problem)}`,
};

const planRefusals: PlanRefusalWording = {
  ...startReasons,
  gone: () => 'no longer on the sky',
  'nothing-to-start': () => 'nothing to start here',
  'base-missing': ({ branch }) => `origin/${branch} doesn't exist`,
};

const stepActions: StepActionWording = {
  reread: ({ handles }) =>
    handles.length === 1
      ? `Re-read ${handles[0]}, stop if anyone holds it`
      : `Re-read all ${handles.length}, stop if anyone holds one`,
  'check-base': ({ branch }) => `Check origin/${branch} exists`,
  claim: ({ handles }) =>
    handles.length === 1 ? `Claim ${handles[0]}` : `Claim all ${handles.length}, all-or-nothing`,
  fetch: () => 'Fetch origin',
  'worktree-resume': ({ branch }) => `Resume in the existing ${branch} worktree`,
  'worktree-on-branch': ({ branch }) => `Worktree on the existing ${branch} branch`,
  'worktree-new': ({ branch, base }) => `Worktree ${branch} off origin/${base}`,
  'worktree-detach': ({ base }) => `Architecture worktree at origin/${base}, no branch`,
  'worktree-reset': ({ base }) => `Reset the architecture worktree to origin/${base}`,
  prune: () => 'Remove the worktrees of closed tickets',
  'open-tab': () => 'Open an iTerm2 tab',
  'open-tmux': ({ name }) => `Open tmux session ${name}`,
};

const stepFailures: StepFailureWording = {
  'base-missing': ({ branch }) => `origin/${branch} doesn't exist`,
};

const takenReasons: TakenReasonWording = {
  closed: ({ handle }) => `${handle} is closed. Nothing changed.`,
  held: ({ handle, holder }) => `Taken: @${holder} holds ${handle}. Nothing changed.`,
  claimed: ({ handle }) => `Taken: ${handle} is claimed. Nothing changed.`,
};

const launchEndings: LaunchEndingWording = {
  opened: ({ command }) => `Tab opened: ${command}`,
  taken: ({ taken }) => word(takenReasons, taken),
  'step-failed': ({ action, rollback, reason }) =>
    reason
      ? `${word(stepFailures, reason)}. ${rollbackResults[rollback]}`
      : `${word(stepActions, action)} failed. ${rollbackResults[rollback]}`,
  refused: ({ reason }) =>
    reason.code === 'gap' ? word(gapTitles, reason.problem) : word(planRefusals, reason),
  crashed: ({ error }) => error,
  'cut-short': () => 'The Start stopped before it finished.',
};

const apiErrors: ApiErrorWording = {
  'not-a-checkout': ({ path }) => `${path} is not a git checkout`,
  'no-origin': ({ path }) => `${path} has no origin remote`,
  'origin-not-github': () => 'origin is not on GitHub',
  'already-added': ({ path }) => `${path} is already added`,
  'bad-tile': () => 'tile must be 1 or 2 letters or a data:image/ URL',
  'unknown-repo': ({ path }) => `no repo at ${path}`,
  'no-origin-head': () => 'origin has no default branch',
  'fixed-identity': ({ path }) => `${path}: owner and name come from origin and can't change`,
  'bad-base-branch': ({ branch }) =>
    branch ? `${branch} isn't a valid branch name` : 'the base branch is blank',
  'blank-prefix-label': () => 'every branch prefix needs a label',
  'bad-branch-prefix': ({ prefix }) =>
    prefix ? `${prefix} can't start a branch name` : 'a branch prefix is blank',
  'bad-worktree-dir': () => 'the worktree folder must be a path',
  'unknown-label': ({ label }) => `${label} is not a canonical label`,
  'blank-label-remap': ({ label }) => `${label} is remapped to a blank name`,
  'bad-theme': () => 'the theme must be dark or light',
  'flag-failed': () => "couldn't save the flag",
  'bad-repo-order': () => 'the order must list every repo once',
  'not-a-repo': ({ repo }) => `${repo} could not be cloned`,
  'by-name-needs-container': () =>
    'only the container adds a repo by owner/name. On the Mac, add the folder of a checkout',
  'tab-closed': () => "the session's terminal tab is closed",
  'type-failed': ({ stderr }) =>
    stderr ? `couldn't type into the terminal: ${stderr}` : "couldn't type into the terminal",
};

const releaseRefusals: ReleaseRefusalWording = {
  'not-claimed': ({ status }) =>
    status === null ? 'not claimed, it has no Status line' : `not claimed, its Status is ${status}`,
};

export const codes = {
  gates,
  readiness,
  systemStates,
  systemKinds,
  ticketKinds,
  gapTiers,
  stepKeys,
  baseSources,
  rollbackResults,
  gapTitles,
  gapEffects,
  startLabels,
  startReasons,
  planRefusals,
  stepActions,
  stepFailures,
  takenReasons,
  launchEndings,
  apiErrors,
  releaseRefusals,
};
