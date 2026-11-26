import '@angular/compiler';
import {
  createEnvironmentInjector,
  type EnvironmentInjector,
  Injector,
  provideZonelessChangeDetection,
  ɵINJECTOR_SCOPE,
} from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RepoConfig } from '@contract/repo';
import { Api, ApiFailure } from '@app/api/api';
import { Board } from './board';

function repo(name: string): RepoConfig {
  return {
    path: `/code/${name}`,
    owner: 'me',
    name,
    branchPrefixes: [],
    fallbackPrefix: 'feature',
    labels: {},
    tile: { letters: name.slice(0, 2).toUpperCase() },
  };
}

class FakeApi {
  saves: string[][] = [];
  private replies: { resolve: () => void; reject: (error: unknown) => void }[] = [];
  reorderRepos(paths: string[]): Promise<void> {
    this.saves.push(paths);
    return new Promise((resolve, reject) => this.replies.push({ resolve, reject }));
  }
  succeed(): void {
    this.replies.shift()?.resolve();
  }
  fail(error: unknown): void {
    this.replies.shift()?.reject(error);
  }
}

describe('reordering the Rail', () => {
  let api: FakeApi;
  let board: Board;
  const order = () => board.repos().map((r) => r.name);

  beforeEach(() => {
    api = new FakeApi();
    const injector = createEnvironmentInjector(
      [
        { provide: ɵINJECTOR_SCOPE, useValue: 'root' },
        provideZonelessChangeDetection(),
        { provide: Api, useValue: api },
      ],
      Injector.create({ providers: [] }) as EnvironmentInjector,
    );
    board = injector.get(Board);
    board.repos.set([repo('app'), repo('lib'), repo('docs')]);
    board.activePath.set('/code/app');
  });

  it('shows the new order before the save answers and keeps the active repo', async () => {
    const saving = board.reorder(['/code/lib', '/code/docs', '/code/app']);
    expect(order()).toEqual(['lib', 'docs', 'app']);
    expect(api.saves).toEqual([['/code/lib', '/code/docs', '/code/app']]);
    api.succeed();
    await saving;
    expect(order()).toEqual(['lib', 'docs', 'app']);
    expect(board.active()?.name).toBe('app');
  });

  it('puts the old order back when the save fails, and passes the failure on', async () => {
    const failure = new ApiFailure(400, { error: 'x', reason: { code: 'bad-repo-order' } });
    const saving = board.reorder(['/code/docs', '/code/app', '/code/lib']);
    api.fail(failure);
    await expect(saving).rejects.toBe(failure);
    expect(order()).toEqual(['app', 'lib', 'docs']);
  });

  it('keeps a repo added during the save at the bottom after a rollback', async () => {
    const saving = board.reorder(['/code/docs', '/code/app', '/code/lib']);
    board.repos.update((repos) => [...repos, repo('new')]);
    api.fail(new Error('offline'));
    await expect(saving).rejects.toThrow('offline');
    expect(order()).toEqual(['app', 'lib', 'docs', 'new']);
  });

  it('leaves a later reorder in place when an earlier save fails', async () => {
    const first = board.reorder(['/code/docs', '/code/app', '/code/lib']);
    const second = board.reorder(['/code/lib', '/code/docs', '/code/app']);
    api.fail(new Error('offline'));
    await expect(first).rejects.toThrow('offline');
    expect(order()).toEqual(['lib', 'docs', 'app']);
    api.succeed();
    await second;
  });
});
