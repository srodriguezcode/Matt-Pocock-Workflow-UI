/**
 * `gh api graphql --paginate` walks `$endCursor` itself. `first:50` is GitHub's cap on blockers.
 * A connection nested under `blockedBy` costs 50 rate-limit points a page, so blockers carry no labels.
 */
export const SKY_QUERY = `
query ($owner: String!, $name: String!, $endCursor: String) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: 100, after: $endCursor, orderBy: { field: CREATED_AT, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ...Ref
        labels(first: 20) { nodes { name color } }
        body
        assignees(first: 10) { nodes { login } }
        parent { ...Ref labels(first: 20) { nodes { name color } } subIssuesSummary { total completed } }
        blockedBy(first: 50) { nodes { ...Ref parent { number } } }
        subIssuesSummary { total completed }
        timelineItems(last: 1, itemTypes: [ASSIGNED_EVENT]) { nodes { ... on AssignedEvent { createdAt } } }
      }
    }
  }
}
fragment Ref on Issue {
  number title state stateReason url createdAt
  repository { nameWithOwner }
}`;

/** One alias per closed parent, since only a closed System's body is missing from the Sky read. */
export function bodiesQuery(numbers: number[]): string {
  const fields = numbers.map((n) => `i${n}: issue(number: ${n}) { body }`).join('\n    ');
  return `
query ($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    ${fields}
  }
}`;
}

/** `first:100` is GitHub's cap on sub-issues. */
export const ROUTE_QUERY = `
query ($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      subIssues(first: 100) {
        nodes {
          number title state stateReason url createdAt
          repository { nameWithOwner }
          labels(first: 20) { nodes { name color } }
          subIssuesSummary { total completed }
          blockedBy(first: 50) { nodes { number state repository { nameWithOwner } } }
        }
      }
    }
  }
}`;

export type IssueState = 'OPEN' | 'CLOSED';
export type StateReason = 'COMPLETED' | 'NOT_PLANNED' | 'DUPLICATE' | 'REOPENED' | null;

export interface RefNode {
  number: number;
  title: string;
  state: IssueState;
  stateReason: StateReason;
  url: string;
  createdAt?: string;
  /** Absent in fixtures recorded before the query asked for it. Those are all local. */
  repository?: Repository;
  labels?: Labels;
}

export interface Labels {
  nodes: { name: string; color: string }[];
}

export interface Repository {
  nameWithOwner: string;
}

export interface IssueNode extends RefNode {
  labels: Labels;
  body: string;
  assignees: { nodes: { login: string }[] };
  parent: (RefNode & { labels: Labels; subIssuesSummary: Summary }) | null;
  blockedBy: { nodes: (RefNode & { parent: { number: number } | null })[] };
  subIssuesSummary: Summary;
  timelineItems: { nodes: { createdAt?: string }[] };
}

export interface Summary {
  total: number;
  completed: number;
}

export interface SkyPage {
  data: {
    viewer: { login: string };
    repository: { issues: { nodes: IssueNode[] } };
  };
}

export interface BodiesReply {
  data: { repository: Record<string, { body: string } | null> };
}

export interface RouteNode extends RefNode {
  labels: Labels;
  subIssuesSummary: Summary;
  blockedBy: { nodes: { number: number; state: IssueState; repository?: Repository }[] };
}

export interface RouteReply {
  data: { repository: { issue: { subIssues: { nodes: RouteNode[] } } | null } };
}
