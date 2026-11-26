import type { StartSkill } from '@contract/gap';
import type { IssueDetail } from '@contract/issue';
import type { TakenReason } from '@contract/launch';
import type { RepoConfig } from '@contract/repo';
import type { IssueRef } from '@contract/sky';
import { commandLine, type CommandRunner } from '#server/core/runner.ts';
import type { RawIssue, Tracker } from '#server/tracker/tracker.ts';
import { baseLine } from './base.ts';
import { FLAGGED_LABEL } from './flagged-label.ts';
import { toRawGraph, toRouteIssues } from './graph.ts';
import {
  bodiesQuery,
  ROUTE_QUERY,
  SKY_QUERY,
  type BodiesReply,
  type RouteReply,
  type SkyPage,
} from './query.ts';

interface ViewJson {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  url: string;
  labels: { name: string; color: string }[];
  body: string;
  comments: { author: { login: string } | null; createdAt: string; body: string }[];
}

type Replied<T> = T & { errors?: { message: string }[] };

function ghIn(runner: CommandRunner, repo: RepoConfig) {
  const gh = async (args: string[]): Promise<string> => {
    const result = await runner.run('gh', args, { cwd: repo.path });
    if (result.code !== 0)
      throw new Error(result.stderr.trim() || `${commandLine('gh', args)} failed`);
    return result.stdout;
  };
  const graphql = async <T>(query: string, extra: string[]): Promise<T[]> => {
    const args = ['api', 'graphql', '-f', `owner=${repo.owner}`, '-f', `name=${repo.name}`];
    const stdout = await gh([...args, '-f', `query=${query}`, ...extra]);
    const parsed = JSON.parse(stdout) as Replied<T> | Replied<T>[];
    const replies = Array.isArray(parsed) ? parsed : [parsed];
    const errors = replies.flatMap((reply) => reply.errors ?? []);
    if (errors.length) throw new Error(errors.map((e) => e.message).join('; '));
    return replies;
  };
  const pages = <T>(query: string) => graphql<T>(query, ['--paginate', '--slurp']);
  const one = async <T>(query: string, extra: string[] = []) =>
    (await graphql<T>(query, extra))[0]!;
  return { gh, pages, one };
}

export function githubTracker(runner: CommandRunner, repo: RepoConfig): Tracker {
  const { gh, pages, one } = ghIn(runner, repo);
  const claimArgs = (id: string) => ['issue', 'edit', id, '--add-assignee', '@me'];
  const releaseArgs = (id: string) => ['issue', 'edit', id, '--remove-assignee', '@me'];
  const flagArgs = (id: string, flagged: boolean) => [
    'issue',
    'edit',
    id,
    flagged ? '--add-label' : '--remove-label',
    FLAGGED_LABEL.name,
  ];
  const createLabelArgs = [
    'label',
    'create',
    FLAGGED_LABEL.name,
    '--color',
    FLAGGED_LABEL.color,
    '--description',
    FLAGGED_LABEL.description,
  ];
  const takenArgs = (id: string) => [
    'issue',
    'view',
    id,
    '-R',
    `${repo.owner}/${repo.name}`,
    '--json',
    'state,assignees',
  ];

  return {
    kind: 'github',

    async read() {
      const graph = toRawGraph(await pages<SkyPage>(SKY_QUERY), `${repo.owner}/${repo.name}`);
      const parents = graph.issues.filter((i) => i.state === 'closed' && i.childIds.length > 0);
      if (parents.length) {
        const query = bodiesQuery(parents.map((issue) => issue.number!));
        const reply = await one<BodiesReply>(query);
        for (const issue of parents) {
          issue.body = reply.data.repository[`i${issue.id}`]?.body ?? '';
          issue.base = baseLine(issue.body);
        }
      }
      return graph;
    },

    async taken(claim): Promise<TakenReason | null> {
      const view = JSON.parse(await gh(takenArgs(claim.id))) as {
        state: 'OPEN' | 'CLOSED';
        assignees: { login: string }[];
      };
      if (view.state === 'CLOSED') return { code: 'closed', handle: claim.handle };
      const holder = view.assignees[0]?.login;
      return holder ? { code: 'held', handle: claim.handle, holder } : null;
    },

    /** Open sub-issues too: their blockers carry the Lanes out of the closed ones. */
    async children(id): Promise<RawIssue[]> {
      const reply = await one<RouteReply>(ROUTE_QUERY, ['-F', `number=${id}`]);
      const nodes = reply.data.repository.issue?.subIssues.nodes ?? [];
      return toRouteIssues(nodes, id, `${repo.owner}/${repo.name}`);
    },

    isId: (id) => /^\d+$/.test(id),

    async detail(id): Promise<IssueDetail> {
      const fields = 'number,title,state,url,labels,body,comments';
      const view = JSON.parse(await gh(['issue', 'view', id, '--json', fields])) as ViewJson;
      return {
        id,
        handle: `#${view.number}`,
        number: view.number,
        title: view.title,
        url: view.url,
        path: null,
        labels: view.labels.map(({ name, color }) => ({ name, color })),
        state: view.state === 'OPEN' ? 'open' : 'closed',
        body: view.body,
        comments: view.comments.map((c) => ({
          author: c.author?.login ?? 'ghost',
          createdAt: c.createdAt,
          body: c.body,
        })),
      };
    },

    async claim(id) {
      await gh(claimArgs(id));
      return null;
    },

    async release(id) {
      await gh(releaseArgs(id));
    },

    /** `gh` reports a missing label as `'flagged' not found`. */
    async flag(id, flagged) {
      try {
        await gh(flagArgs(id, flagged));
      } catch (error) {
        if (!flagged || !(error as Error).message.includes(`'${FLAGGED_LABEL.name}' not found`))
          throw error;
        await gh(createLabelArgs);
        await gh(flagArgs(id, flagged));
      }
    },

    claimCommand: (id) => commandLine('gh', claimArgs(id)),
    releaseCommand: (id) => commandLine('gh', releaseArgs(id)),
    takenCommand: (id) => commandLine('gh', takenArgs(id)),
    flagCommand: (id, flagged) => commandLine('gh', flagArgs(id, flagged)),
    skillArg: githubSkillArg,
    branchSlug: (ref) => String(ref.number ?? ref.id),
  };
}

export function githubSkillArg(ref: IssueRef, skill: StartSkill): string {
  const number = String(ref.number ?? ref.id);
  return skill === 'wayfinder' ? number : `#${number}`;
}
