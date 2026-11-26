import type { CommandRunner } from '#server/core/runner.ts';

export async function localState(
  runner: CommandRunner,
  checkout: string,
): Promise<{ branches: string[]; worktrees: string[] }> {
  const branches = await runner.run('git', ['branch', '--list', '--format=%(refname:short)'], {
    cwd: checkout,
  });
  const worktrees = await runner.run('git', ['worktree', 'list', '--porcelain'], { cwd: checkout });
  for (const result of [branches, worktrees]) {
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'git failed');
  }
  return {
    branches: branches.stdout.split('\n').filter(Boolean),
    worktrees: worktrees.stdout
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length)),
  };
}
