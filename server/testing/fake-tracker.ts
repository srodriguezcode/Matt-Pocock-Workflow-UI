import type { IssueDetail } from '@contract/issue';
import type { TakenReason } from '@contract/launch';
import type { IssueRef } from '@contract/sky';
import type { RawGraph, RawIssue, Tracker } from '#server/tracker/tracker.ts';

/** A Tracker over a fixed graph that records writes and can be told to fail any of them. */
export class FakeTracker implements Tracker {
  readonly kind;
  readonly graph: RawGraph;
  readonly writes: string[] = [];
  /** Per-id answers for `taken`, in place of what the graph says. */
  readonly takens = new Map<string, TakenReason>();
  failClaimOn: string | null = null;
  failReleaseOn: string | null = null;
  failFlagOn: string | null = null;
  /** What `claim` reports it overwrote, per id. */
  readonly previous = new Map<string, string>();

  constructor(graph: RawGraph) {
    this.graph = graph;
    this.kind = graph.tracker;
  }

  async read(): Promise<RawGraph> {
    return this.graph;
  }

  async taken(claim: { id: string; handle: string }): Promise<TakenReason | null> {
    const override = this.takens.get(claim.id);
    if (override) return override;
    const issue = this.graph.issues.find((i) => i.id === claim.id);
    if (issue?.state === 'closed') return { code: 'closed', handle: claim.handle };
    const holder = issue?.assignees[0];
    return holder ? { code: 'held', handle: claim.handle, holder } : null;
  }

  async children(systemId: string): Promise<RawIssue[]> {
    return this.graph.issues.filter((issue) => issue.parentId === systemId);
  }

  isId(id: string): boolean {
    return id.length > 0;
  }

  async detail(id: string): Promise<IssueDetail> {
    const issue = this.graph.issues.find((i) => i.id === id);
    if (!issue) throw new Error(`no issue ${id}`);
    const { id: _, handle, number, title, url, path, labels, body, state } = issue;
    return { id, handle, number, title, url, path, labels, body, state, comments: [] };
  }

  async claim(id: string): Promise<string | null> {
    if (this.failClaimOn === id) throw new Error(`claim ${id} failed`);
    this.writes.push(`claim ${id}`);
    return this.previous.get(id) ?? null;
  }

  async release(id: string, previous?: string | null): Promise<void> {
    if (this.failReleaseOn === id) throw new Error(`release ${id} failed`);
    this.writes.push(previous === undefined ? `release ${id}` : `release ${id} ${previous}`);
  }

  async flag(id: string, flagged: boolean): Promise<void> {
    if (this.failFlagOn === id) throw new Error(`flag ${id} failed`);
    this.writes.push(`${flagged ? 'flag' : 'unflag'} ${id}`);
  }

  claimCommand(id: string): string {
    return `claim ${id}`;
  }

  releaseCommand(id: string): string {
    return `release ${id}`;
  }

  takenCommand(id: string): string {
    return `taken ${id}`;
  }

  flagCommand(id: string, flagged: boolean): string {
    return `${flagged ? 'flag' : 'unflag'} ${id}`;
  }

  branchSlug(ref: IssueRef): string {
    return ref.id.replaceAll('/', '-');
  }

  skillArg(ref: IssueRef): string {
    return ref.handle;
  }
}
