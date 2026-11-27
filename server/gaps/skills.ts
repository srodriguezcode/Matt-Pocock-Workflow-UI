import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Gap, StartSkill } from '@contract/gap';
import type { LaunchKind, NewSessionSkill } from '@contract/launch';
import type { RepoConfig } from '@contract/repo';
import type { FileSystem } from '#server/core/fs.ts';
import { gap } from './build.ts';
import { parseOr } from './json.ts';

interface SkillNeed {
  name: StartSkill;
  blocks: LaunchKind[];
}

const NEEDS: SkillNeed[] = [
  { name: 'implement', blocks: ['ticket', 'system'] },
  { name: 'implement-ticket', blocks: ['ticket'] },
  { name: 'implement-parallel', blocks: ['system'] },
  { name: 'wayfinder', blocks: ['decision', 'map'] },
  { name: 'to-tickets', blocks: ['split'] },
  { name: 'triage', blocks: ['triage'] },
  { name: 'improve-codebase-architecture', blocks: ['architecture'] },
];

/** The clone this server runs from, so a bundled-skill fix can `ln -s` out of it. */
export const BOARD_CHECKOUT = fileURLToPath(new URL('../../', import.meta.url));

/** Bundled by this board. Every other missing skill points at the setup skill instead. */
const BUNDLED = new Set<StartSkill>(['implement-ticket', 'implement-parallel']);

export const SESSION_SKILLS: NewSessionSkill[] = [
  'grill-with-docs',
  'to-spec',
  'wayfinder',
  'triage',
];

interface Lookup {
  found: boolean;
  searched: string[];
}

/** Looks a skill up where Claude Code loads it in this repo: project, user, `.agents`, plugins. */
async function skillLookup(
  fs: FileSystem,
  repo: RepoConfig,
  home: string,
  claudeConfigDir: string | null,
): Promise<(name: string) => Promise<Lookup>> {
  const configDir = claudeConfigDir ?? join(home, '.claude');
  const userSkills = join(configDir, 'skills');
  const hasAgentsSkills = (await fs.list(join(repo.path, '.agents', 'skills'))) !== null;
  const plugins = await installedPlugins(fs, configDir, repo.path);
  return async (name) => {
    const searched = [
      join(repo.path, '.claude', 'skills', name, 'SKILL.md'),
      join(userSkills, name, 'SKILL.md'),
      ...(hasAgentsSkills ? [join(repo.path, '.agents', 'skills', name, 'SKILL.md')] : []),
      ...plugins.flatMap((plugin) => pluginSkillPaths(plugin, name)),
    ];
    let found = false;
    for (const path of searched) if ((await fs.read(path)) !== null) found = true;
    return { found, searched };
  };
}

/** A missing one is left out, never a Gap: a new session runs without a skill. */
export async function sessionSkills(
  fs: FileSystem,
  repo: RepoConfig,
  home: string,
  claudeConfigDir: string | null = null,
): Promise<NewSessionSkill[]> {
  const lookup = await skillLookup(fs, repo, home, claudeConfigDir);
  const installed: NewSessionSkill[] = [];
  for (const name of SESSION_SKILLS) if ((await lookup(name)).found) installed.push(name);
  return installed;
}

export async function checkSkills(
  fs: FileSystem,
  repo: RepoConfig,
  home: string,
  boardCheckout: string,
  claudeConfigDir: string | null = null,
): Promise<Gap[]> {
  const lookup = await skillLookup(fs, repo, home, claudeConfigDir);
  const gaps: Gap[] = [];
  for (const need of NEEDS) {
    const { found, searched } = await lookup(need.name);
    if (found) continue;
    gaps.push(
      gap(
        `skill-${need.name}`,
        'repo',
        'start',
        { code: 'skill-missing', skill: need.name },
        BUNDLED.has(need.name)
          ? {
              command: `ln -s "${join(boardCheckout, 'skills', need.name)}" ${claudeConfigDir ? join(claudeConfigDir, 'skills', need.name) : `~/.claude/skills/${need.name}`}`,
            }
          : { skill: '/setup-matt-pocock-skills' },
        need.blocks,
        searched,
      ),
    );
  }
  return gaps;
}

interface Plugin {
  root: string;
  /** The skill folders its `plugin.json` lists, relative to `root`. */
  skillDirs: string[];
}

interface InstalledPlugins {
  plugins?: Record<string, { installPath?: string; projectPath?: string }[]>;
}

/** The enabled plugins Claude Code loads in this repo, read from its install record. */
async function installedPlugins(
  fs: FileSystem,
  configDir: string,
  repoPath: string,
): Promise<Plugin[]> {
  const readJson = async <T>(path: string) => parseOr<T | null>((await fs.read(path)) ?? '', null);
  const installed = await readJson<InstalledPlugins>(
    join(configDir, 'plugins', 'installed_plugins.json'),
  );
  const settings = await readJson<{ enabledPlugins?: Record<string, boolean> }>(
    join(configDir, 'settings.json'),
  );
  const plugins: Plugin[] = [];
  for (const [key, installs] of Object.entries(installed?.plugins ?? {})) {
    if (settings?.enabledPlugins?.[key] === false) continue;
    for (const { installPath, projectPath } of installs) {
      if (!installPath || (projectPath && projectPath !== repoPath)) continue;
      const manifest = await readJson<{ skills?: string | string[] }>(
        join(installPath, '.claude-plugin', 'plugin.json'),
      );
      const skills = manifest?.skills ?? [];
      plugins.push({
        root: installPath,
        skillDirs: typeof skills === 'string' ? [skills] : skills,
      });
    }
  }
  return plugins;
}

function pluginSkillPaths(plugin: Plugin, name: string): string[] {
  const listed = plugin.skillDirs.filter((dir) => basename(dir) === name);
  return [join(plugin.root, 'skills', name), ...listed.map((dir) => join(plugin.root, dir))]
    .map((dir) => join(dir, 'SKILL.md'))
    .filter((path, i, all) => all.indexOf(path) === i);
}
