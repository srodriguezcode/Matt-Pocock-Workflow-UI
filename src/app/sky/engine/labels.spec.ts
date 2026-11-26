import { describe, expect, it } from 'vitest';
import { englishMessages } from '@app/i18n/messages.en';
import { harborSky } from '@app/sky/testing/harbor-sky';
import { type SceneOptions, testScene } from '@app/sky/testing/scene';
import { centreOn, TOP_INSET } from './camera';
import { toScreen } from './geometry';
import { touched } from './hit';
import { type LabelFont, labelItems, type PlacedLabel, placeLabels } from './labels';
import { layoutSky } from './layout';
import { withRoute } from './route';
import type { Scene, Selection, ZoomLevel } from './types';
import { LOOSE } from './types';

const sky = withRoute(harborSky(), null);
const layout = layoutSky(sky);
const viewport = { w: 1200, h: 800 };
const measure = (text: string, font: LabelFont) => text.length * font.size * 0.6;
const LIT = new Set(['frontier', 'yours', 'decision-frontier']);

function scene(s: number, over: SceneOptions = {}): Scene {
  const level: ZoomLevel = s < 0.45 ? 'sky' : s < 1.15 ? 'system' : 'star';
  const camera = centreOn(layout.stars.get('602')!, viewport, s);
  return testScene(sky, layout, { camera, viewport, level, ...over });
}

const systemStates = englishMessages.board.codes.systemStates;
const words = {
  stateSuffix: (state: keyof typeof systemStates) =>
    state === 'live' ? '' : ` · ${systemStates[state].toLowerCase()}`,
};

function items(s: Scene, selection: Selection = null) {
  return labelItems(s, selection, touched(sky, selection), words);
}

function textOf(s: Scene, id: string, selection: Selection = null): string | undefined {
  return items(s, selection).find((i) => i.id === id)?.text;
}

function box(l: PlacedLabel) {
  const w = measure(l.item.text, l.item.font) + 4;
  const h = l.item.font.size + 3;
  return { x0: l.x - w / 2, x1: l.x + w / 2, y0: l.y - h / 2, y1: l.y + h / 2 };
}

const SKY = 0.3;
const SYSTEM = 0.8;
const STAR = 1.6;

describe('label level of detail', () => {
  it('names Systems and numbers only lit tickets at sky zoom', () => {
    const s = scene(SKY);
    const ids = new Set(items(s).map((i) => i.id));
    for (const system of sky.systems) expect(ids.has(system.id)).toBe(true);
    for (const ticket of sky.tickets) {
      expect(ids.has(ticket.id)).toBe(LIT.has(ticket.light));
      if (LIT.has(ticket.light)) expect(textOf(s, ticket.id)).toBe(ticket.handle);
    }
    for (const ember of sky.embers) expect(ids.has(ember.id)).toBe(false);
    expect(textOf(s, '602')).toBe('#602  the Podcast section');
  });

  it('numbers every ticket and titles the lit ones at system zoom', () => {
    const s = scene(SYSTEM);
    expect(textOf(s, '633')).toBe('#633  Podcast ticket zero: fi…');
    expect(textOf(s, '634')).toBe('#634');
    expect(textOf(s, '636')).toBe('#636');
    expect(textOf(s, '600')).toBe('#600');
  });

  it('titles every ticket at star zoom', () => {
    const s = scene(STAR);
    expect(textOf(s, '636')).toBe('#636  Podcast: the Episode Page — listen …');
    for (const ticket of sky.tickets) expect(textOf(s, ticket.id)).toMatch(/^#\d+ {2}\S/);
  });

  it('writes Fog short at sky zoom and full-length from system zoom', () => {
    const head = 'Books against the per-read-through reads';
    const fogged = { ...sky, fog: sky.fog.map((f, i) => (i === 0 ? { ...f, head } : f)) };
    const text = (s: number) =>
      labelItems({ ...scene(s), sky: fogged }, null, null, words).find((i) => i.id === 'fog-1')
        ?.text;
    expect(text(SKY)).toBe('Books against the per-r…');
    expect(text(SYSTEM)).toBe(head);
    expect(text(STAR)).toBe(head);
  });

  it('titles the focused tickets and shows their Embers at sky zoom', () => {
    const s = scene(SKY);
    const selection: Selection = { kind: 'star', id: '636' };
    expect(textOf(s, '636', selection)).toBe('#636  Podcast: the Episode Page — listen page and…');
    expect(textOf(s, '641', selection)).toMatch(/^#641 {2}Podcast/);
    expect(textOf(s, '601')).toBeUndefined();
    expect(textOf(s, '601', { kind: 'star', id: '602' })).toBe('#601');
  });

  it('follows the zoom level, not the camera scale', () => {
    const s = scene(STAR, { level: 'sky' });
    expect(textOf(s, '634')).toBeUndefined();
    expect(textOf(s, '633')).toBe('#633');
  });

  it('names a star where it is drawn mid-tween', () => {
    const s = scene(SYSTEM);
    const drawn = { x: 10, y: 20 };
    const tweening = { ...s, where: (id: string) => (id === '633' ? drawn : s.where(id)) };
    const item = items(tweening).find((i) => i.id === '633')!;
    expect(item.at).toEqual(toScreen(drawn, s.camera));
  });

  it('marks a System that needs tickets or is spent', () => {
    const needy = withRoute(
      {
        ...sky,
        systems: sky.systems.map((s) => (s.id === '586' ? { ...s, state: 'needs-tickets' } : s)),
      },
      null,
    );
    const s = testScene(needy, layout, { camera: scene(SKY).camera, viewport, level: 'sky' });
    expect(labelItems(s, null, null, words).find((i) => i.id === '586')?.text).toBe(
      `#586  ${sky.systems.find((x) => x.id === '586')!.name} · needs tickets`,
    );
  });

  it('leaves out hidden Systems, and Fog with the Map', () => {
    const s = scene(SYSTEM, { hidden: new Set(['602', '512', LOOSE]) });
    const ids = new Set(items(s).map((i) => i.id));
    expect(ids.has('602')).toBe(false);
    expect(ids.has('633')).toBe(false);
    expect(ids.has('595')).toBe(false);
    expect([...ids].some((id) => id.startsWith('fog-'))).toBe(false);
    expect(ids.has('586')).toBe(true);
  });
});

describe('placeLabels', () => {
  const CROWDED = { sky: 0.2, system: 0.5 };

  for (const [level, s] of [
    ['sky', CROWDED.sky],
    ['system', CROWDED.system],
    ['star', 1.16],
  ] as const) {
    it(`drops colliding labels at ${level} zoom, never stacks them`, () => {
      const all = items(scene(s));
      const { placed, dropped } = placeLabels(all, viewport, measure);
      expect(dropped.length).toBeGreaterThan(0);
      const boxes = placed.map(box);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          expect(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0).toBe(false);
        }
      }
      const placedIds = new Set(placed.map((l) => l.item.id));
      for (const id of dropped) expect(placedIds.has(id)).toBe(false);
    });
  }

  it('places the selected label before the ones it would collide with', () => {
    const s = scene(CROWDED.sky);
    const before = placeLabels(items(s), viewport, measure);
    const loser = before.dropped.find((id) => sky.tickets.some((t) => t.id === id))!;
    expect(loser).toBeDefined();
    const selection: Selection = { kind: 'star', id: loser };
    const after = placeLabels(items(s, selection), viewport, measure);
    expect(after.placed.some((l) => l.item.id === loser)).toBe(true);
  });

  it('places Systems before tickets and embers', () => {
    const s = scene(SKY);
    const at = items(s).find((i) => i.id === '602')!.at;
    const crowd = [
      { ...items(s).find((i) => i.id === '633')!, at, offset: 26 },
      ...items(s).filter((i) => i.id === '602'),
    ];
    const { placed } = placeLabels(crowd, viewport, measure);
    const system = placed.find((l) => l.item.id === '602')!;
    expect(system.y).toBeCloseTo(at.y + 26);
  });

  it('keeps labels out of a reserved box', () => {
    const s = scene(SYSTEM);
    const controls = { x0: 0, x1: viewport.w, y0: 0, y1: TOP_INSET };
    const top = items(s).map((i) => ({ ...i, at: { x: i.at.x, y: TOP_INSET / 2 } }));
    const { placed } = placeLabels(top, viewport, measure, [controls]);
    expect(placed.length).toBeGreaterThan(0);
    for (const l of placed) expect(box(l).y0).toBeGreaterThanOrEqual(TOP_INSET);
  });

  it('skips labels that fall off screen without counting them as dropped', () => {
    const s = scene(STAR);
    const { placed, dropped } = placeLabels(items(s), viewport, measure);
    expect(placed.length + dropped.length).toBeLessThan(items(s).length);
  });
});
