import { describe, expect, it } from 'vitest';
import { englishMessages } from '@app/i18n/messages.en';
import { harborSky, unitsRoute, withClosedArc, withClosedRoute } from '@app/sky/testing/harbor-sky';
import { type SceneOptions, testScene } from '@app/sky/testing/scene';
import { toScreen } from './geometry';
import { hitTest, touched } from './hit';
import { labelItems } from './labels';
import { layoutSky } from './layout';
import { arrowTarget } from './nav';
import { pinLayout } from './pin';
import { withRoute } from './route';
import type { Layout, Scene, Selection } from './types';
import { skyFit } from './zoom';

const unread = withRoute(withClosedArc(harborSky()), null);
const sky = withRoute(unread, unitsRoute());
const layout = layoutSky(sky);
const CLOSED = ['290', '291', '289'];

function radiusIn(l: Layout, systemId: string, id: string): number {
  const disc = l.discs.find((d) => d.systemId === systemId)!;
  const star = l.stars.get(id)!;
  return Math.hypot(star.x - disc.x, star.y - disc.y);
}

function sceneFor(selection: Selection, over: SceneOptions = {}): Scene {
  return testScene(sky, layout, {
    camera: { x: 600, y: 400, s: 1 },
    level: 'system',
    selection,
    ...over,
  });
}

function screenOf(s: Scene, id: string) {
  return toScreen(s.where(id)!, s.camera);
}

describe('a System with a closed route', () => {
  it('puts its closed tickets on inner rings, inside its open ones', () => {
    const open = sky.tickets.filter((t) => t.systemId === '292').map((t) => t.id);
    const innermostOpen = Math.min(...open.map((id) => radiusIn(layout, '292', id)));
    for (const id of CLOSED) {
      expect(layout.stars.get(id)!.role).toBe('closed');
      expect(radiusIn(layout, '292', id)).toBeLessThan(innermostOpen);
    }
    for (const a of CLOSED) {
      for (const b of open) {
        const [p, q] = [layout.stars.get(a)!, layout.stars.get(b)!];
        expect(Math.hypot(p.x - q.x, p.y - q.y), `${a} ${b}`).toBeGreaterThan(20);
      }
    }
  });

  it('moves no open star when the route arrives or goes', () => {
    const before = layoutSky(unread);
    expect([...layout.stars.keys()].filter((id) => !before.stars.has(id)).sort()).toEqual(
      [...CLOSED].sort(),
    );
    for (const [id, star] of before.stars) expect(layout.stars.get(id), id).toEqual(star);
    expect(layout.discs).toEqual(before.discs);
  });

  it('gives each lane depth its own ring when the reserved rings have room', () => {
    const systems = unread.systems.map((s) =>
      s.id === '292' ? { ...s, arc: { closed: 20, total: 24 } } : s,
    );
    const l = layoutSky(withRoute({ ...unread, systems }, unitsRoute()));
    expect(radiusIn(l, '292', '291')).toBeGreaterThan(radiusIn(l, '292', '290'));
    expect(radiusIn(l, '292', '289')).toBeCloseTo(radiusIn(l, '292', '291'));
  });

  it('moves no open star when the System is selected or deselected', () => {
    const before = sceneFor(null);
    const selected = sceneFor({ kind: 'star', id: '292' });
    const after = sceneFor(null);
    for (const id of layout.stars.keys()) {
      if (CLOSED.includes(id)) continue;
      expect(selected.where(id), id).toEqual(before.where(id));
      expect(after.where(id), id).toEqual(before.where(id));
    }
  });

  it('keeps the closed tickets where they were across a refresh', () => {
    const pinned = pinLayout(layout, layoutSky(withClosedRoute(harborSky())));
    for (const id of CLOSED) expect(pinned.layout.stars.get(id)).toEqual(layout.stars.get(id));
    expect(pinned.moved.size).toBe(0);
  });

  it('can click a closed ticket only while the route shows', () => {
    const shown = sceneFor({ kind: 'star', id: '292' });
    expect(hitTest(shown, screenOf(shown, '291'))).toEqual({ kind: 'star', id: '291' });
    const plain = sceneFor(null);
    expect(hitTest(plain, screenOf(plain, '291'))).not.toEqual({ kind: 'star', id: '291' });
    const hidden = sceneFor({ kind: 'star', id: '292' }, { hidden: new Set(['292']) });
    expect(hitTest(hidden, screenOf(hidden, '291'))).toBeNull();
  });

  it('lights the closed tickets with their System', () => {
    const lit = touched(sky, { kind: 'star', id: '292' })!;
    for (const id of CLOSED) expect(lit.has(id)).toBe(true);
    expect(touched(sky, { kind: 'star', id: '291' })).toEqual(new Set(['291', '290', '292']));
  });

  it('numbers the closed tickets like Embers, only while the route shows', () => {
    const systemStates = englishMessages.board.codes.systemStates;
    const words = {
      stateSuffix: (state: keyof typeof systemStates) =>
        state === 'live' ? '' : ` · ${systemStates[state].toLowerCase()}`,
    };
    const labelled = (selection: Selection, level: Scene['level']) =>
      labelItems(sceneFor(selection, { level }), selection, touched(sky, selection), words)
        .filter((i) => CLOSED.includes(i.id))
        .map((i) => [i.id, i.text, i.tone]);
    expect(labelled(null, 'system')).toEqual([]);
    expect(labelled({ kind: 'star', id: '292' }, 'system')).toEqual([
      ['290', '#290', 'ember'],
      ['291', '#291', 'ember'],
      ['289', '#289', 'ember'],
    ]);
    expect(labelled({ kind: 'star', id: '292' }, 'sky')).toHaveLength(3);
  });

  it('steps the arrows onto a closed ticket only while the route shows', () => {
    const shown = sceneFor({ kind: 'star', id: '292' });
    expect(arrowTarget(shown, '292', 'up')).toBe('290');
    expect(arrowTarget(shown, '292', 'left')).toBe('291');
    expect(arrowTarget(shown, '291', 'right')).toBe('289');
    const plain = sceneFor(null);
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      for (const from of ['292', '293']) {
        expect(CLOSED).not.toContain(arrowTarget(plain, from, direction));
      }
    }
  });

  it('fits the closed tickets into the sky fit while the route shows', () => {
    const shown = sceneFor({ kind: 'star', id: '292' }, { viewport: { w: 1200, h: 800 } });
    const camera = skyFit(shown);
    for (const id of CLOSED) {
      const p = toScreen(shown.where(id)!, camera);
      expect(p.x >= 0 && p.x <= 1200 && p.y >= 0 && p.y <= 800, id).toBe(true);
    }
  });
});
