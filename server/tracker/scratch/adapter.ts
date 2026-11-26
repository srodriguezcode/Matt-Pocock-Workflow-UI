import { join, relative } from 'node:path';
import type { StartSkill } from '@contract/gap';
import type { IssueDetail } from '@contract/issue';
import type { TakenReason } from '@contract/launch';
import type { RepoConfig } from '@contract/repo';
import type { IssueRef } from '@contract/sky';
import { commandLine, type CommandRunner } from '#server/core/runner.ts';
import type { FileSystem } from '#server/core/fs.ts';
import { issueRef } from '#server/sky/shape.ts';
import {
  ReleaseRefused,
  type RawGraph,
  type RawIssue,
  type Tracker,
} from '#server/tracker/tracker.ts';
import {
  firstHeading,
  readTicketText,
  splitBlockers,
  statusMeaning,
  withFlag,
  withStatus,
  type TicketText,
} from './parse.ts';

const TICKET_FILE = /^(\d+)(?:-.*)?\.md$/;
const SYNC_CONFLICT = /\.sync-conflict-.*\.md$/;
const ID = /^(?!\.)[\w.-]+(\/\d+)?$/;

interface TicketFile {
  nn: string;
  path: string;
  text: string;
  createdAt: string | null;
}

interface Effort {
  name: string;
  path: string;
  hint: 'map' | 'spec' | 'plain';
  body: string;
  createdAt: string | null;
  tickets: TicketFile[];
}

type Added = Map<string, string>;

const MARK = '@@';

async function addedDates(runner: CommandRunner, repo: RepoConfig): Promise<Added> {
  const log = ['log', '--diff-filter=A', '--no-renames', '--relative', `--format=${MARK}%aI`];
  const args = ['-c', 'core.quotePath=false', ...log];
  const result = await runner.run('git', [...args, '--name-only', '--', '.scratch'], {
    cwd: repo.path,
  });
  const added: Added = new Map();
  if (result.code !== 0) return added;
  let date = '';
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith(MARK)) date = line.slice(MARK.length);
    else if (line.trim()) added.set(line, date);
  }
  return added;
}

const earliest = (dates: (string | null)[]): string | null =>
  dates.reduce<string | null>(
    (best, date) => (date && (!best || Date.parse(date) < Date.parse(best)) ? date : best),
    null,
  );

export function scratchTracker(fs: FileSystem, runner: CommandRunner, repo: RepoConfig): Tracker {
  const root = join(repo.path, '.scratch');
  const known = new Map<string, TicketFile>();
  const claimedFrom = new Map<string, string | null>();
  const mainFiles = new Map<string, string>();

  const ticketFiles = async (
    effortPath: string,
    added: Added = new Map(),
  ): Promise<TicketFile[] | null> => {
    const entries = await fs.list(join(effortPath, 'issues'));
    if (!entries) return null;
    const files = await Promise.all(
      entries.map(async (entry) => {
        const nn = SYNC_CONFLICT.test(entry.name) ? undefined : TICKET_FILE.exec(entry.name)?.[1];
        if (entry.dir || !nn) return [];
        const path = join(effortPath, 'issues', entry.name);
        const text = await fs.read(path);
        const createdAt = added.get(relative(repo.path, path)) ?? null;
        return text === null ? [] : [{ nn, path, text, createdAt }];
      }),
    );
    return files.flat();
  };

  const effortAt = async (name: string, added: Added = new Map()): Promise<Effort | null> => {
    const path = join(root, name);
    const tickets = await ticketFiles(path, added);
    if (!tickets) return null;
    const map = await fs.read(join(path, 'map.md'));
    const spec = map === null ? await fs.read(join(path, 'spec.md')) : null;
    const hint = map !== null ? 'map' : spec !== null ? 'spec' : 'plain';
    for (const ticket of tickets) known.set(`${name}/${ticket.nn}`, ticket);
    const bodyFile = hint === 'map' ? 'map.md' : 'spec.md';
    if (hint !== 'plain') mainFiles.set(name, join(path, bodyFile));
    const createdAt =
      hint === 'plain' ? null : (added.get(relative(repo.path, join(path, bodyFile))) ?? null);
    return {
      name,
      path,
      hint,
      body: map ?? spec ?? '',
      createdAt: createdAt ?? earliest(tickets.map((t) => t.createdAt)),
      tickets,
    };
  };

  const ticketAt = async (id: string): Promise<TicketFile> => {
    const [effort = '', nn = ''] = id.split('/');
    const files = (await ticketFiles(join(root, effort))) ?? [];
    const file = files.find((f) => f.nn === nn);
    if (!file) throw new Error(`ENOENT: ${join(root, effort, 'issues', `${nn}-*.md`)}`);
    known.set(id, file);
    return file;
  };

  const shownPath = (id: string) => {
    const [effort = '', nn = ''] = id.split('/');
    return known.get(id)?.path ?? join(root, effort, 'issues', `${nn}-*.md`);
  };

  const setStatus = async (id: string, file: TicketFile, status: string | null) => {
    const text = withStatus(file.text, status);
    await fs.write(file.path, text);
    known.set(id, { ...file, text });
  };

  const releaseTo = (text: TicketText) => (text.typeLine !== null ? null : 'ready-for-agent');

  const readAll = async (): Promise<RawGraph> => {
    const entries = (await fs.list(root)) ?? [];
    const added = await addedDates(runner, repo);
    const efforts = await Promise.all(
      entries.filter((entry) => entry.dir).map((entry) => effortAt(entry.name, added)),
    );
    const issues = efforts.flatMap((effort) => (effort ? effortIssues(effort) : []));
    return { tracker: 'scratch', viewer: null, issues };
  };

  return {
    kind: 'scratch',

    read: readAll,

    async taken(claim): Promise<TakenReason | null> {
      const file = await ticketAt(claim.id);
      const meaning = statusMeaning(readTicketText(file.text).status);
      if (meaning.state === 'closed') return { code: 'closed', handle: claim.handle };
      if (meaning.claimed) return { code: 'claimed', handle: claim.handle };
      return null;
    },

    async children(systemId): Promise<RawIssue[]> {
      return (await readAll()).issues.filter((issue) => issue.parentId === systemId);
    },

    isId: (id) => ID.test(id),

    async detail(id): Promise<IssueDetail> {
      if (!id.includes('/')) {
        const effort = await effortAt(id);
        if (!effort) throw new Error(`ENOENT: ${join(root, id, 'issues')}`);
        const issue = systemIssue(effort, []);
        return { ...issueRef(issue), state: 'open', body: effort.body, comments: [] };
      }
      const file = await ticketAt(id);
      const issue = ticketIssue(id.split('/')[0]!, file, new Map());
      return { ...issueRef(issue), state: issue.state, body: file.text, comments: [] };
    },

    async claim(id) {
      const file = await ticketAt(id);
      const previous = readTicketText(file.text).status;
      await setStatus(id, file, 'claimed');
      claimedFrom.set(id, previous);
      return previous;
    },

    async release(id, previous) {
      const file = await ticketAt(id);
      claimedFrom.delete(id);
      if (previous !== undefined) return setStatus(id, file, previous);
      const text = readTicketText(file.text);
      if (!statusMeaning(text.status).claimed) throw new ReleaseRefused(id, text.status);
      await setStatus(id, file, releaseTo(text));
    },

    async flag(id, flagged) {
      if (id.includes('/')) {
        const file = await ticketAt(id);
        const text = withFlag(file.text, flagged);
        if (text !== file.text) await fs.write(file.path, text);
        known.set(id, { ...file, text });
        return;
      }
      const effort = await effortAt(id);
      if (!effort) throw new Error(`ENOENT: ${join(root, id, 'issues')}`);
      const path = mainFiles.get(id);
      if (!path) throw new Error(`${id} has no map.md or spec.md to flag`);
      const text = withFlag(effort.body, flagged);
      if (text !== effort.body) await fs.write(path, text);
    },

    claimCommand(id) {
      const file = known.get(id);
      const from = file ? readTicketText(file.text).status : undefined;
      return statusEdit(shownPath(id), from, 'claimed');
    },

    releaseCommand(id) {
      const to = claimedFrom.has(id)
        ? claimedFrom.get(id)!
        : releaseTo(readTicketText(known.get(id)?.text ?? ''));
      return statusEdit(shownPath(id), 'claimed', to);
    },

    takenCommand: (id) => commandLine('cat', [shownPath(id)]),
    flagCommand(id, flagged) {
      const path = id.includes('/')
        ? shownPath(id)
        : (mainFiles.get(id) ?? join(root, id, '{map,spec}.md'));
      return `${path}: ${flagged ? '+' : '-'} Flagged: yes`;
    },
    skillArg: scratchSkillArg,
    /** `<effort>/<NN>` would nest a folder under the worktree dir. */
    branchSlug: (ref) => ref.id.replaceAll('/', '-'),
  };
}

/**
 * The absolute path, since the agent may sit in a worktree. A System's is its effort folder,
 * except where the skill reads one file: `/wayfinder` its `map.md`, `/to-tickets` its `spec.md`.
 */
export function scratchSkillArg(ref: IssueRef, skill: StartSkill): string {
  const path = ref.path ?? ref.id;
  if (ref.id.includes('/')) return path;
  if (skill === 'wayfinder') return join(path, 'map.md');
  if (skill === 'to-tickets') return join(path, 'spec.md');
  return path;
}

/**
 * The `Status:` edit in diff notation, since no one shell line makes it: `+` adds the line,
 * `-` drops it, `→` swaps the value. `from` is `undefined` before the board read the file.
 */
function statusEdit(path: string, from: string | null | undefined, to: string | null): string {
  if (from === null) return `${path}: + Status: ${to}`;
  if (to === null) return `${path}: - Status: ${from}`;
  return from === undefined ? `${path}: Status: ${to}` : `${path}: Status: ${from} → ${to}`;
}

function effortIssues(effort: Effort): RawIssue[] {
  const byNumber = new Map(effort.tickets.map((t) => [Number(t.nn), `${effort.name}/${t.nn}`]));
  const tickets = effort.tickets.map((file) => ticketIssue(effort.name, file, byNumber));
  return [systemIssue(effort, tickets), ...tickets];
}

function systemIssue(effort: Effort, tickets: RawIssue[]): RawIssue {
  return {
    ...blank(effort.name, effort.name, effort.path),
    title: firstHeading(effort.body) ?? effort.name,
    createdAt: effort.createdAt,
    body: effort.body,
    childIds: tickets.map((t) => t.id),
    children: {
      total: tickets.length,
      closed: tickets.filter((t) => t.state === 'closed').length,
    },
    systemHint: effort.hint,
    flagged: effort.hint !== 'plain' && readTicketText(effort.body).flagged,
  };
}

function ticketIssue(effort: string, file: TicketFile, byNumber: Map<number, string>): RawIssue {
  const text = readTicketText(file.text);
  const meaning = statusMeaning(text.status);
  const { numbers, outside } = splitBlockers(text.blockedBy);
  const unknown = numbers.filter((n) => !byNumber.has(n));
  const title = text.title?.replace(/^\d+\s*(?:[—–-]|:)\s*/, '') ?? file.path.split('/').pop()!;
  return {
    ...blank(`${effort}/${file.nn}`, file.nn, file.path),
    title,
    createdAt: file.createdAt,
    body: file.text,
    state: meaning.state,
    closeReason: meaning.closeReason,
    labels: meaning.label ? [{ name: meaning.label, color: '' }] : [],
    claim: meaning.claimed ? { holder: null, since: null } : null,
    parentId: effort,
    blockedByIds: numbers.flatMap((n) => byNumber.get(n) ?? []),
    outsideBlockers: [
      ...unknown.map((n) => String(n).padStart(2, '0')),
      ...(outside ? [outside] : []),
    ],
    typeLine: text.typeLine,
    flagged: text.flagged,
  };
}

function blank(id: string, handle: string, path: string): RawIssue {
  return {
    id,
    handle,
    number: null,
    title: '',
    body: '',
    url: null,
    path,
    state: 'open',
    createdAt: null,
    closeReason: null,
    labels: [],
    assignees: [],
    claim: null,
    parentId: null,
    childIds: [],
    children: { total: 0, closed: 0 },
    blockedByIds: [],
    outsideBlockers: [],
    systemHint: null,
    typeLine: null,
    base: null,
    namedParentId: null,
    flagged: false,
  };
}
