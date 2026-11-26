import '@angular/compiler';
import {
  ApplicationRef,
  createEnvironmentInjector,
  type EnvironmentInjector,
  Injector,
  provideZonelessChangeDetection,
  ɵINJECTOR_SCOPE,
} from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ClosedRoute, SkyResponse } from '@contract/api';
import { Api } from '@app/api/api';
import { harborSky, unitsRoute, withClosedArc } from '@app/sky/testing/harbor-sky';
import { Board } from '@app/state/board';
import { ClosedRoutes } from '@app/state/closed-routes';
import { SkyView } from './sky-view';

const REPO = '/repo';

function read(): SkyResponse {
  return { sky: withClosedArc(harborSky()), starts: {}, readAt: 't0' };
}

class FakeApi {
  calls: string[] = [];
  private replies: ((route: ClosedRoute) => void)[] = [];
  route(_repo: string, id: string): Promise<ClosedRoute> {
    this.calls.push(id);
    return new Promise((resolve) => this.replies.push(resolve));
  }
  answer(): void {
    this.replies.shift()?.(unitsRoute());
  }
}

const flush = () => new Promise<void>((r) => setTimeout(r));

describe('the closed route of the selection', () => {
  let api: FakeApi;
  let board: Board;
  let view: SkyView;
  let tick: () => void;

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
    view = injector.get(SkyView);
    injector.get(ClosedRoutes);
    const app = injector.get(ApplicationRef);
    tick = () => app.tick();
    board.activePath.set(REPO);
    board.skyResponse.set(read());
    tick();
  });

  const select = (selection: Parameters<SkyView['select']>[0]) => {
    view.select(selection);
    tick();
    return view.closedRoute();
  };

  const loaded = async () => {
    api.answer();
    await flush();
    tick();
  };

  it('opens on a System with closed children before its route is read', () => {
    expect(select({ kind: 'star', id: '292' })).toBe('292');
    expect(select({ kind: 'star', id: '602' })).toBeNull();
    expect(select(null)).toBeNull();
  });

  it('stays open on a closed child and on a line into one', async () => {
    select({ kind: 'star', id: '292' });
    await loaded();
    expect(select({ kind: 'star', id: '291' })).toBe('292');
    expect(select({ kind: 'line', id: '290->291' })).toBe('292');
  });

  it('never opens on an Ember or an open Ticket', () => {
    expect(select({ kind: 'star', id: '600' })).toBeNull();
    expect(select({ kind: 'star', id: '293' })).toBeNull();
  });

  it('loads once per Sky read, and keeps the route up while the next read loads', async () => {
    select({ kind: 'star', id: '292' });
    await loaded();
    select({ kind: 'star', id: '291' });
    select({ kind: 'star', id: '292' });
    expect(api.calls).toEqual(['292']);
    expect(board.route()?.systemId).toBe('292');

    board.skyResponse.set(read());
    tick();
    expect(api.calls).toEqual(['292', '292']);
    expect(board.route()?.systemId).toBe('292');
    await loaded();
    expect(board.route()?.systemId).toBe('292');
  });
});
