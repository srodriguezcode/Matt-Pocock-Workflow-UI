import { describe, expect, it } from 'vitest';
import type { StarKind } from '@contract/launch';
import type { SessionView } from '@contract/session';
import type { Claim, Sky, System, Ticket } from '@contract/sky';
import { placeSessions } from './place';

const mine = (since: string): Claim => ({
  holder: 'me',
  since,
  ageDays: 0,
  heldWeek: false,
  mine: true,
});

function ticket(id: string, over: Partial<Ticket> = {}): Ticket {
  return { id, kind: 'build', systemId: 'S', claim: null, ...over } as Ticket;
}

function system(id: string, over: Partial<System> = {}): System {
  return { id, kind: 'spec', ...over } as System;
}

const sky = (tickets: Ticket[]): Sky =>
  ({ mapId: 'M', systems: [system('M', { kind: 'map' }), system('S')], tickets }) as Sky;

function session(
  id: string,
  kind: StarKind,
  target: string,
  over: Partial<SessionView> = {},
): SessionView {
  return {
    sessionId: id,
    target: { kind, id: target },
    state: 'working',
    startedAt: '2026-09-30T10:00:00Z',
    ...over,
  } as SessionView;
}

const shape = (placed: ReturnType<typeof placeSessions>) =>
  [...placed].map(([star, p]) => [star, p.session.sessionId, p.sharedFrom]);

describe('placeSessions', () => {
  it('puts a Split Session on its Spec', () => {
    const placed = placeSessions(sky([]), [session('a', 'split', 'S')]);
    expect(shape(placed)).toEqual([['S', 'a', null]]);
  });

  it('puts a Ticket or Decision Session on its ticket', () => {
    const on = sky([ticket('1'), ticket('2', { kind: 'decision' })]);
    const placed = placeSessions(on, [session('a', 'ticket', '1'), session('b', 'decision', '2')]);
    expect(shape(placed)).toEqual([
      ['1', 'a', null],
      ['2', 'b', null],
    ]);
  });

  it('puts a triage Session on its Untriaged ticket', () => {
    const placed = placeSessions(sky([ticket('1')]), [session('a', 'triage', '1')]);
    expect(shape(placed)).toEqual([['1', 'a', null]]);
  });

  it('leaves out a Session whose target is not on the sky', () => {
    expect(placeSessions(sky([ticket('1')]), [session('a', 'ticket', '9')]).size).toBe(0);
  });

  it('puts a Frontier system Session on the System and shares it with the claimed children', () => {
    const on = sky([
      ticket('1', { claim: mine('2026-09-30T10:01:00Z') }),
      ticket('2', { claim: mine('2026-09-30T10:01:00Z') }),
      ticket('3'),
      ticket('4', { systemId: 'Other', claim: mine('2026-09-30T10:01:00Z') }),
    ]);
    expect(shape(placeSessions(on, [session('a', 'system', 'S')]))).toEqual([
      ['S', 'a', null],
      ['1', 'a', 'S'],
      ['2', 'a', 'S'],
    ]);
  });

  describe('a Map Session', () => {
    const decision = (id: string, since: string, over: Partial<Ticket> = {}) =>
      ticket(id, { kind: 'decision', claim: mine(since), ...over });
    const map = session('m', 'map', 'M');

    it('stays on the Map with no Decision ticket claimed', () => {
      expect(shape(placeSessions(sky([ticket('1')]), [map]))).toEqual([['M', 'm', null]]);
    });

    it('moves to the one Decision ticket claimed since it started', () => {
      const on = sky([
        decision('1', '2026-09-30T10:05:00Z'),
        decision('2', '2026-09-29T09:00:00Z'),
        ticket('3', { claim: mine('2026-09-30T10:05:00Z') }),
      ]);
      expect(shape(placeSessions(on, [map]))).toEqual([['1', 'm', null]]);
    });

    it('stays on the Map when several match', () => {
      const on = sky([
        decision('1', '2026-09-30T10:05:00Z'),
        decision('2', '2026-09-30T10:06:00Z'),
      ]);
      expect(shape(placeSessions(on, [map]))).toEqual([['M', 'm', null]]);
    });

    it('skips a Decision ticket another Session already sits on', () => {
      const on = sky([
        decision('1', '2026-09-30T10:05:00Z'),
        decision('2', '2026-09-30T10:06:00Z'),
      ]);
      const placed = placeSessions(on, [session('d', 'decision', '1'), map]);
      expect(shape(placed)).toEqual([
        ['1', 'd', null],
        ['2', 'm', null],
      ]);
    });
  });
});

describe('placeSessions with a new session', () => {
  it('puts it on no star', () => {
    const fresh = session('n', 'ticket', '1', {
      target: { kind: 'session', key: 'k1', title: '' },
    });
    expect(placeSessions(sky([ticket('1')]), [fresh]).size).toBe(0);
  });
});
