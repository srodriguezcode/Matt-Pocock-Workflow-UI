import { describe, expect, it } from 'vitest';
import type { RepoConfig } from '@contract/repo';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { checkSkills, sessionSkills } from './skills.ts';

const repo: RepoConfig = {
  path: '/code/app',
  owner: 'me',
  name: 'app',
  branchPrefixes: [],
  fallbackPrefix: 'feature',
  labels: {},
  tile: { letters: 'AP' },
};

describe('checkSkills', () => {
  it('finds nothing when all seven resolve in the repo', async () => {
    const fs = new FakeFs({
      '/code/app/.claude/skills/implement/SKILL.md': '',
      '/code/app/.claude/skills/implement-ticket/SKILL.md': '',
      '/code/app/.claude/skills/implement-parallel/SKILL.md': '',
      '/code/app/.claude/skills/wayfinder/SKILL.md': '',
      '/code/app/.claude/skills/to-tickets/SKILL.md': '',
      '/code/app/.claude/skills/triage/SKILL.md': '',
      '/code/app/.claude/skills/improve-codebase-architecture/SKILL.md': '',
    });
    expect(await checkSkills(fs, repo, '/home/dev', '/board')).toEqual([]);
  });

  it('accepts a skill resolved from home instead', async () => {
    const fs = new FakeFs({
      '/home/dev/.claude/skills/implement/SKILL.md': '',
      '/home/dev/.claude/skills/implement-ticket/SKILL.md': '',
      '/home/dev/.claude/skills/implement-parallel/SKILL.md': '',
      '/home/dev/.claude/skills/wayfinder/SKILL.md': '',
      '/home/dev/.claude/skills/to-tickets/SKILL.md': '',
      '/home/dev/.claude/skills/triage/SKILL.md': '',
      '/home/dev/.claude/skills/improve-codebase-architecture/SKILL.md': '',
    });
    expect(await checkSkills(fs, repo, '/home/dev', '/board')).toEqual([]);
  });

  it('points a missing bundled skill at its ln -s fix and lists searched paths', async () => {
    const fs = new FakeFs({
      '/code/app/.claude/skills/implement/SKILL.md': '',
      '/code/app/.claude/skills/implement-ticket/SKILL.md': '',
      '/code/app/.claude/skills/wayfinder/SKILL.md': '',
      '/code/app/.claude/skills/to-tickets/SKILL.md': '',
      '/code/app/.claude/skills/triage/SKILL.md': '',
      '/code/app/.claude/skills/improve-codebase-architecture/SKILL.md': '',
    });
    const gaps = await checkSkills(fs, repo, '/home/dev', '/board');
    expect(gaps).toEqual([
      expect.objectContaining({
        id: 'skill-implement-parallel',
        problem: { code: 'skill-missing', skill: 'implement-parallel' },
        scope: 'repo',
        tier: 'start',
        blocks: ['system'],
        fix: {
          command: 'ln -s "/board/skills/implement-parallel" ~/.claude/skills/implement-parallel',
        },
        searched: [
          '/code/app/.claude/skills/implement-parallel/SKILL.md',
          '/home/dev/.claude/skills/implement-parallel/SKILL.md',
        ],
      }),
    ]);
  });

  it('points a missing non-bundled skill at the setup skill', async () => {
    const fs = new FakeFs({
      '/code/app/.claude/skills/implement-ticket/SKILL.md': '',
      '/code/app/.claude/skills/implement-parallel/SKILL.md': '',
      '/code/app/.claude/skills/wayfinder/SKILL.md': '',
      '/code/app/.claude/skills/to-tickets/SKILL.md': '',
      '/code/app/.claude/skills/triage/SKILL.md': '',
      '/code/app/.claude/skills/improve-codebase-architecture/SKILL.md': '',
    });
    const gaps = await checkSkills(fs, repo, '/home/dev', '/board');
    expect(gaps).toEqual([
      expect.objectContaining({
        id: 'skill-implement',
        blocks: ['ticket', 'system'],
        fix: { skill: '/setup-matt-pocock-skills' },
      }),
    ]);
  });

  it('blocks a ticket Start on a missing /implement-ticket and points at its ln -s fix', async () => {
    const fs = new FakeFs({
      '/code/app/.claude/skills/implement/SKILL.md': '',
      '/code/app/.claude/skills/implement-parallel/SKILL.md': '',
      '/code/app/.claude/skills/wayfinder/SKILL.md': '',
      '/code/app/.claude/skills/to-tickets/SKILL.md': '',
      '/code/app/.claude/skills/triage/SKILL.md': '',
      '/code/app/.claude/skills/improve-codebase-architecture/SKILL.md': '',
    });
    const gaps = await checkSkills(fs, repo, '/home/dev', '/board');
    expect(gaps).toEqual([
      expect.objectContaining({
        id: 'skill-implement-ticket',
        blocks: ['ticket'],
        fix: {
          command: 'ln -s "/board/skills/implement-ticket" ~/.claude/skills/implement-ticket',
        },
      }),
    ]);
  });

  it('also searches .agents/skills when that folder exists in the repo', async () => {
    const fs = new FakeFs({
      '/code/app/.agents/skills/keep.txt': '',
      '/code/app/.agents/skills/wayfinder/SKILL.md': '',
      '/code/app/.agents/skills/to-tickets/SKILL.md': '',
      '/code/app/.claude/skills/triage/SKILL.md': '',
      '/code/app/.claude/skills/implement/SKILL.md': '',
      '/code/app/.claude/skills/implement-ticket/SKILL.md': '',
      '/code/app/.claude/skills/implement-parallel/SKILL.md': '',
      '/code/app/.claude/skills/improve-codebase-architecture/SKILL.md': '',
    });
    expect(await checkSkills(fs, repo, '/home/dev', '/board')).toEqual([]);
  });

  it('blocks the architecture Start when its skill is missing', async () => {
    const fs = new FakeFs({
      '/code/app/.claude/skills/implement/SKILL.md': '',
      '/code/app/.claude/skills/implement-ticket/SKILL.md': '',
      '/code/app/.claude/skills/implement-parallel/SKILL.md': '',
      '/code/app/.claude/skills/wayfinder/SKILL.md': '',
      '/code/app/.claude/skills/to-tickets/SKILL.md': '',
      '/code/app/.claude/skills/triage/SKILL.md': '',
    });
    const gaps = await checkSkills(fs, repo, '/home/dev', '/board');
    expect(gaps).toEqual([
      expect.objectContaining({
        id: 'skill-improve-codebase-architecture',
        problem: { code: 'skill-missing', skill: 'improve-codebase-architecture' },
        tier: 'start',
        blocks: ['architecture'],
        fix: { skill: '/setup-matt-pocock-skills' },
      }),
    ]);
  });

  it('blocks only the triage Start when /triage is missing', async () => {
    const fs = new FakeFs({
      '/code/app/.claude/skills/implement/SKILL.md': '',
      '/code/app/.claude/skills/implement-ticket/SKILL.md': '',
      '/code/app/.claude/skills/implement-parallel/SKILL.md': '',
      '/code/app/.claude/skills/wayfinder/SKILL.md': '',
      '/code/app/.claude/skills/to-tickets/SKILL.md': '',
      '/code/app/.claude/skills/improve-codebase-architecture/SKILL.md': '',
    });
    const gaps = await checkSkills(fs, repo, '/home/dev', '/board');
    expect(gaps).toEqual([
      expect.objectContaining({
        id: 'skill-triage',
        problem: { code: 'skill-missing', skill: 'triage' },
        tier: 'start',
        blocks: ['triage'],
        fix: { skill: '/setup-matt-pocock-skills' },
      }),
    ]);
  });

  it('searches the Claude config dir in place of home, and points the fix there', async () => {
    const all = [
      'implement',
      'implement-ticket',
      'implement-parallel',
      'wayfinder',
      'to-tickets',
      'triage',
      'improve-codebase-architecture',
    ];
    const found = new FakeFs(Object.fromEntries(all.map((n) => [`/cfg/skills/${n}/SKILL.md`, ''])));
    expect(await checkSkills(found, repo, '/home/dev', '/app', '/cfg')).toEqual([]);

    const homeOnly = new FakeFs({ '/home/dev/.claude/skills/implement/SKILL.md': '' });
    const gaps = await checkSkills(homeOnly, repo, '/home/dev', '/app', '/cfg');
    const parallel = gaps.find((g) => g.id === 'skill-implement-parallel');
    expect(parallel?.fix).toEqual({
      command: 'ln -s "/app/skills/implement-parallel" /cfg/skills/implement-parallel',
    });
    expect(parallel?.searched).toContain('/cfg/skills/implement-parallel/SKILL.md');
    expect(parallel?.searched).not.toContain(
      '/home/dev/.claude/skills/implement-parallel/SKILL.md',
    );
    expect(gaps.some((g) => g.id === 'skill-implement')).toBe(true);
  });

  describe('the mattpocock-skills plugin', () => {
    const install =
      '/home/dev/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/1.3.2';
    const upstream = [
      'implement',
      'wayfinder',
      'to-tickets',
      'triage',
      'improve-codebase-architecture',
    ];
    const installed = (entry: Record<string, unknown>) =>
      JSON.stringify({
        version: 2,
        plugins: {
          'mattpocock-skills@claude-plugins-official': [{ installPath: install, ...entry }],
        },
      });
    const pluginFiles = (entry: Record<string, unknown> = { scope: 'user' }) => ({
      '/home/dev/.claude/plugins/installed_plugins.json': installed(entry),
      [`${install}/.claude-plugin/plugin.json`]: JSON.stringify({
        name: 'mattpocock-skills',
        skills: upstream.map((name) => `./skills/engineering/${name}`),
      }),
      ...Object.fromEntries(
        upstream.map((name) => [`${install}/skills/engineering/${name}/SKILL.md`, '']),
      ),
      '/home/dev/.claude/skills/implement-ticket/SKILL.md': '',
      '/home/dev/.claude/skills/implement-parallel/SKILL.md': '',
    });

    it('finds upstream skills installed as a Claude Code plugin', async () => {
      expect(await checkSkills(new FakeFs(pluginFiles()), repo, '/home/dev', '/board')).toEqual([]);
    });

    it('takes a project-scoped install only in its own project', async () => {
      const here = new FakeFs(pluginFiles({ scope: 'project', projectPath: '/code/app' }));
      expect(await checkSkills(here, repo, '/home/dev', '/board')).toEqual([]);
      const elsewhere = new FakeFs(pluginFiles({ scope: 'project', projectPath: '/code/other' }));
      const gaps = await checkSkills(elsewhere, repo, '/home/dev', '/board');
      expect(gaps.map((g) => g.id)).toContain('skill-implement');
    });

    it('skips a plugin the settings turn off', async () => {
      const fs = new FakeFs({
        ...pluginFiles(),
        '/home/dev/.claude/settings.json': JSON.stringify({
          enabledPlugins: { 'mattpocock-skills@claude-plugins-official': false },
        }),
      });
      const gaps = await checkSkills(fs, repo, '/home/dev', '/board');
      expect(gaps.map((g) => g.id)).toContain('skill-implement');
    });
  });
});

describe('sessionSkills', () => {
  it('lists only the installed new-session skills, and raises no Gap for the rest', async () => {
    const fs = new FakeFs({
      '/code/app/.claude/skills/implement/SKILL.md': '',
      '/code/app/.claude/skills/implement-ticket/SKILL.md': '',
      '/code/app/.claude/skills/implement-parallel/SKILL.md': '',
      '/code/app/.claude/skills/wayfinder/SKILL.md': '',
      '/code/app/.claude/skills/to-tickets/SKILL.md': '',
      '/code/app/.claude/skills/triage/SKILL.md': '',
      '/code/app/.claude/skills/improve-codebase-architecture/SKILL.md': '',
      '/home/dev/.claude/skills/triage/SKILL.md': '',
    });
    expect(await sessionSkills(fs, repo, '/home/dev')).toEqual(['wayfinder', 'triage']);
    expect(await checkSkills(fs, repo, '/home/dev', '/board')).toEqual([]);
  });
});
