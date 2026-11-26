import { basename, dirname, join, resolve } from 'node:path';
import type { Config, RepoConfig, Theme } from '@contract/repo';
import type { FileSystem } from '#server/core/fs.ts';

export function configPath(home: string): string {
  return join(home, '.config', 'ui-agent-workflow', 'config.json');
}

export async function readConfig(fs: FileSystem, home: string): Promise<Config> {
  const text = await fs.read(configPath(home));
  if (text === null) return { repos: [], theme: 'dark' };
  const parsed = JSON.parse(text) as Partial<Config>;
  return {
    repos: (parsed.repos ?? []).map(withDefaults),
    theme: isTheme(parsed.theme) ? parsed.theme : 'dark',
  };
}

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

export async function writeConfig(fs: FileSystem, home: string, config: Config): Promise<void> {
  const path = configPath(home);
  await fs.mkdir(dirname(path));
  await fs.write(path, `${JSON.stringify(config, null, 2)}\n`);
}

export function withDefaults(
  repo: Partial<RepoConfig> & Pick<RepoConfig, 'path' | 'owner' | 'name'>,
): RepoConfig {
  return {
    branchPrefixes: [{ label: 'bug', prefix: 'bugfix' }],
    fallbackPrefix: 'feature',
    labels: {},
    tile: { letters: tileLetters(repo.name) },
    ...repo,
  };
}

/** `ui-agent-workflow` → `UA`. A single word gives its first two letters. */
export function tileLetters(name: string): string {
  const words = name.split(/[-_\s]+/).filter(Boolean);
  const letters =
    words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '').slice(0, 2);
  return letters.toUpperCase();
}

export function worktreeDir(repo: RepoConfig): string {
  return repo.worktreeDir
    ? resolve(repo.path, repo.worktreeDir)
    : join(dirname(repo.path), `${basename(repo.path)}.worktrees`);
}
