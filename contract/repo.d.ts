export type TrackerKind = 'github' | 'scratch';

export interface BranchPrefix {
  label: string;
  prefix: string;
}

/** Canonical label names a repo may call something else. `wayfinder:` stands for the whole `wayfinder:*` family. */
export type CanonicalLabel =
  | 'ready-for-agent'
  | 'ready-for-human'
  | 'needs-triage'
  | 'needs-info'
  | 'to-be-confirmed'
  | 'spec'
  | 'wayfinder:map'
  | 'wayfinder:';

export type LabelRemaps = Partial<Record<CanonicalLabel, string>>;

/** `image` is a data URL. */
export type Tile = { letters: string } | { image: string };

export interface RepoConfig {
  path: string;
  owner: string;
  name: string;
  baseBranch?: string;
  branchPrefixes: BranchPrefix[];
  fallbackPrefix: string;
  /** Resolved against `path`. Defaults to `../<checkout folder>.worktrees/`. */
  worktreeDir?: string;
  labels: LabelRemaps;
  tile: Tile;
}

export type Theme = 'dark' | 'light';

export interface Config {
  repos: RepoConfig[];
  theme: Theme;
}
