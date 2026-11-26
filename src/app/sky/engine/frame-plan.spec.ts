import type { SessionState, SessionView } from '@contract/session';
import { describe, expect, it } from 'vitest';
import { harborSky, withClosedArc, withClosedRoute } from '@app/sky/testing/harbor-sky';
import { testScene } from '@app/sky/testing/scene';
import { type FrameInput, type FramePlan, framePlan } from './frame-plan';
import { layoutSky } from './layout';
import { type RoutedSky, withRoute } from './route';
import type { Selection } from './types';
import { LOOSE } from './types';

const sky = withRoute(harborSky(), null);
const routed = withClosedRoute(withClosedArc(harborSky()));

interface PlanOptions extends Partial<FrameInput> {
  on?: RoutedSky;
  hidden?: string[];
}

function plan({ on = sky, hidden = [], selection = null, ...input }: PlanOptions = {}): FramePlan {
  const scene = testScene(on, layoutSky(on), { hidden: new Set(hidden), selection });
  return framePlan(scene, {
    selection,
    spinning: new Set(),
    pulses: new Map(),
    sessions: new Map(),
    words: { stateSuffix: () => '' },
    ...input,
  });
}

const star = (p: FramePlan, id: string) => p.stars.find((s) => s.id === id);
const line = (p: FramePlan, id: string) => p.lines.find((l) => l.dep.id === id);

describe('a selection', () => {
  const selection: Selection = { kind: 'star', id: '633' };

  it('dims every Star and line it does not touch', () => {
    const p = plan({ selection });
    expect([star(p, '633')?.dim, star(p, '639')?.dim, star(p, '602')?.dim]).toEqual([1, 1, 1]);
    expect([star(p, '640')?.dim, star(p, '587')?.dim]).toEqual([0.25, 0.25]);
    expect([line(p, '633->639')?.alpha, line(p, '639->643')?.alpha]).toEqual([1, 0.15]);
  });

  it('leaves everything lit with nothing selected', () => {
    const p = plan();
    expect(p.stars.every((s) => s.dim === 1)).toBe(true);
    expect(p.lines.every((l) => l.alpha === 1)).toBe(true);
  });

  it('marks only the selected Star, line or Fog patch', () => {
    const byStar = plan({ selection });
    expect(byStar.stars.filter((s) => s.selected).map((s) => s.id)).toEqual(['633']);
    const byLine = plan({ selection: { kind: 'line', id: '633->639' } });
    expect(byLine.lines.filter((l) => l.selected).map((l) => l.dep.id)).toEqual(['633->639']);
    expect(byLine.stars.some((s) => s.selected)).toBe(false);
    const byFog = plan({ selection: { kind: 'fog', id: 'fog-3' } });
    expect(byFog.fog.filter((f) => f.selected).map((f) => f.patch.id)).toEqual(['fog-3']);
  });

  it('ranks the selected Star first among the labels', () => {
    const label = plan({ selection }).labels.find((l) => l.id === '633');
    expect(label?.priority).toBe(0);
  });
});

describe('the filter', () => {
  it('draws a line faint when one end is hidden, and drops it when both are', () => {
    const p = plan({ hidden: ['559'] });
    expect(line(p, '558->559')?.alpha).toBe(0.12);
    expect(line(p, '560->568')?.alpha).toBe(0.12);
    expect(line(p, '565->568')).toBeUndefined();
    expect(star(p, '568')).toBeUndefined();
  });

  it('keeps the faint alpha under a selection that dims the line', () => {
    const p = plan({ hidden: ['559'], selection: { kind: 'star', id: '633' } });
    expect(line(p, '558->559')?.alpha).toBeCloseTo(0.12 * 0.15);
  });

  it('leaves out hidden discs, the Loose ring and, with the Map, the Fog', () => {
    const open = plan();
    expect(open.discs.map((d) => d.disc.systemId).sort()).toEqual(
      ['292', '512', '558', '559', '586', '602'].sort(),
    );
    expect(open.looseRing).not.toBeNull();
    expect(open.fog).toHaveLength(10);
    const filtered = plan({ hidden: ['602', LOOSE, '512'] });
    expect(filtered.discs.map((d) => d.disc.systemId)).not.toContain('602');
    expect(filtered.discs.map((d) => d.disc.systemId)).not.toContain('512');
    expect(filtered.looseRing).toBeNull();
    expect(filtered.fog).toEqual([]);
  });
});

describe('a closed route', () => {
  const CLOSED = ['290', '291', '289'];

  it('draws its closed children and their lines only while it shows', () => {
    const plain = plan({ on: routed });
    for (const id of CLOSED) expect(star(plain, id)).toBeUndefined();
    expect(line(plain, '290->291')).toBeUndefined();
    const open = plan({ on: routed, selection: { kind: 'star', id: '292' } });
    for (const id of CLOSED) expect(star(open, id)).toBeDefined();
    expect(line(open, '290->291')?.alpha).toBe(1);
  });

  it('draws a Ruled out child as a husk and a Done one as an Ember', () => {
    const open = plan({ on: routed, selection: { kind: 'star', id: '292' } });
    expect(CLOSED.map((id) => star(open, id)?.kind)).toEqual(['ember', 'husk', 'ember']);
    expect(star(open, '600')?.kind).toBe('ember');
  });
});

describe('Star marks', () => {
  it('names each Star by its kind', () => {
    const p = plan();
    expect([star(p, '602')?.kind, star(p, '633')?.kind, star(p, '601')?.kind]).toEqual([
      'system',
      'ticket',
      'ember',
    ]);
  });

  it('spins a Star with a Start running and pulses one whose gate changed', () => {
    const p = plan({ spinning: new Set(['640']), pulses: new Map([['633', 0.4]]) });
    expect(p.stars.filter((s) => s.spinning).map((s) => s.id)).toEqual(['640']);
    expect(p.stars.filter((s) => s.pulse !== undefined).map((s) => [s.id, s.pulse])).toEqual([
      ['633', 0.4],
    ]);
  });

  it('marks an In flight ticket with its Session', () => {
    const on = harborSky();
    on.tickets.find((t) => t.id === '633')!.gate = 'in-flight';
    const session = { state: 'asking' } as SessionView;
    const sessions = new Map([
      ['633', { session, sharedFrom: null }],
      ['639', { session, sharedFrom: null }],
    ]);
    const p = plan({ on: withRoute(on, null), sessions });
    expect(p.stars.filter((s) => s.session).map((s) => [s.id, s.session])).toEqual([
      ['633', 'asking'],
    ]);
  });

  it('reads a week-old Claim as Stale beside a Lost Session, not beside a Waiting one', () => {
    const on = harborSky();
    const claim = { holder: 'ana', since: null, ageDays: 9, heldWeek: true, mine: false };
    for (const id of ['633', '639', '640']) {
      const t = on.tickets.find((tk) => tk.id === id)!;
      t.gate = 'in-flight';
      t.claim = claim;
    }
    const placed = (state: SessionState) => ({
      session: { state } as SessionView,
      sharedFrom: null,
    });
    const sessions = new Map([
      ['633', placed('lost')],
      ['639', placed('waiting')],
    ]);
    const p = plan({ on: withRoute(on, null), sessions });
    const stale = (id: string) => {
      const s = star(p, id);
      return s?.kind === 'ticket' ? s.stale : undefined;
    };
    expect([stale('633'), stale('639'), stale('640')]).toEqual([true, false, true]);
    expect(star(p, '633')?.session).toBe('lost');
  });

  it('flags a line onto a System apart from one onto a Ticket', () => {
    const p = plan();
    expect([line(p, '602->558')?.ontoSystem, line(p, '633->639')?.ontoSystem]).toEqual([
      true,
      false,
    ]);
  });
});
