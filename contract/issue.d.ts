import type { IssueRef } from './sky.d.ts';

export interface IssueComment {
  author: string;
  createdAt: string;
  body: string;
}

export interface IssueDetail extends IssueRef {
  state: 'open' | 'closed';
  /** Markdown. */
  body: string;
  comments: IssueComment[];
}
