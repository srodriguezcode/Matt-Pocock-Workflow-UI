import type { Runtime } from '@contract/runtime';
import type { Gap } from '@contract/gap';
import type { LaunchKind } from '@contract/launch';
import type { FileSystem } from '#server/core/fs.ts';
import type { CommandRunner } from '#server/core/runner.ts';
import { gap } from './build.ts';

const ALL_KINDS: LaunchKind[] = [
  'ticket',
  'system',
  'decision',
  'map',
  'split',
  'architecture',
  'session',
];

export async function checkMachine(
  runner: CommandRunner,
  fs: FileSystem,
  _home: string,
  runtime: Runtime = 'mac',
): Promise<Gap[]> {
  const gaps: Gap[] = [];
  if (!(await found(runner, 'gh'))) {
    gaps.push(
      gap(
        'gh-missing',
        'machine',
        'fatal',
        { code: 'gh-missing' },
        {
          command: 'brew install gh',
        },
      ),
    );
  } else if ((await runner.run('gh', ['auth', 'status'])).code !== 0) {
    gaps.push(
      gap(
        'gh-unauthed',
        'machine',
        'fatal',
        { code: 'gh-unauthed' },
        {
          command: 'gh auth login',
        },
      ),
    );
  }
  if (!(await found(runner, 'git'))) {
    gaps.push(
      gap(
        'git-missing',
        'machine',
        'fatal',
        { code: 'git-missing' },
        {
          command: 'brew install git',
        },
      ),
    );
  }
  if (!(await found(runner, 'claude'))) {
    gaps.push(
      gap(
        'claude-missing',
        'machine',
        'start',
        { code: 'claude-missing' },
        { command: 'npm install -g @anthropic-ai/claude-code' },
        ALL_KINDS,
      ),
    );
  }
  if (runtime === 'mac' && !(await hasIterm(fs))) {
    gaps.push(
      gap(
        'iterm-missing',
        'machine',
        'start',
        { code: 'iterm-missing' },
        { command: 'brew install --cask iterm2' },
        ALL_KINDS,
      ),
    );
  }
  return gaps;
}

async function found(runner: CommandRunner, command: string): Promise<boolean> {
  return (await runner.run('which', [command])).code === 0;
}

async function hasIterm(fs: FileSystem): Promise<boolean> {
  const apps = await fs.list('/Applications');
  return apps?.some((entry) => entry.name.toLowerCase() === 'iterm.app') ?? false;
}
