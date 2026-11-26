import type { Light, System, Ticket } from '@contract/sky';
import { toScreen } from './geometry';
import type { Point, Scene, Selection, Size, ZoomLevel } from './types';

export type LabelTone = 'map' | 'system' | Light | 'ember' | 'fog';

export interface LabelFont {
  size: number;
  bold: boolean;
  italic: boolean;
}

export interface LabelItem {
  id: string;
  text: string;
  tone: LabelTone;
  font: LabelFont;
  /** Screen point the label names. */
  at: Point;
  /** Screen px from `at` to the nearest candidate's centre. */
  offset: number;
  priority: number;
  dim: boolean;
  old: boolean;
}

/** `x`, `y` is the centre, in screen px. */
export interface PlacedLabel {
  item: LabelItem;
  x: number;
  y: number;
}

export interface Placement {
  placed: PlacedLabel[];
  /** Ids whose every candidate collided with a label already placed. */
  dropped: string[];
}

export type Measure = (text: string, font: LabelFont) => number;

/** The words the engine draws, handed in as data so it never imports `I18nService`. */
export interface SkyWords {
  stateSuffix: (state: System['state']) => string;
}

const PRIORITY = { selected: 0, focused: 1, system: 2, lit: 3, ticket: 4, fog: 5, ember: 6 };
const LIT: ReadonlySet<Light> = new Set(['frontier', 'yours', 'decision-frontier']);
const SYSTEM_OFFSET = 26;
const STAR_OFFSET = 12;
const PAD_X = 2;
const TICKET_FONT: LabelFont = { size: 11, bold: false, italic: false };
const FOG_FONT: LabelFont = { size: 10.5, bold: false, italic: true };

function trim(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function labelItems(
  scene: Scene,
  selection: Selection,
  focus: Set<string> | null,
  words: SkyWords,
): LabelItem[] {
  const { sky, layout, camera, shown, level } = scene;
  const screen = (id: string): Point | null => {
    const at = shown.star(id) ? scene.where(id) : null;
    return at ? toScreen(at, camera) : null;
  };
  const focused = (id: string) => !!focus?.has(id);
  const selected = selection?.kind === 'star' ? selection.id : null;
  const rank = (id: string, own: number) =>
    selected === id ? PRIORITY.selected : focused(id) ? PRIORITY.focused : own;
  const dim = (id: string) => !!focus && !focus.has(id);
  const items: LabelItem[] = [];

  for (const system of sky.systems) {
    const at = screen(system.id);
    if (!at) continue;
    items.push({
      id: system.id,
      text: systemText(system) + words.stateSuffix(system.state),
      tone: system.kind === 'map' ? 'map' : 'system',
      font: { size: level === 'sky' ? 13 : 12, bold: true, italic: false },
      at,
      offset: SYSTEM_OFFSET,
      priority: rank(system.id, PRIORITY.system),
      dim: dim(system.id),
      old: system.old,
    });
  }

  for (const ticket of sky.tickets) {
    const at = screen(ticket.id);
    const text = at && ticketText(ticket, level, focused(ticket.id));
    if (!at || !text) continue;
    const lit = LIT.has(ticket.light);
    items.push({
      id: ticket.id,
      text,
      tone: ticket.light,
      font: TICKET_FONT,
      at,
      offset: STAR_OFFSET,
      priority: rank(ticket.id, lit ? PRIORITY.lit : PRIORITY.ticket),
      dim: dim(ticket.id),
      old: false,
    });
  }

  const embers = new Set(sky.embers.map((e) => e.id));
  const closed = (sky.route?.children ?? []).filter((c) => !embers.has(c.id));
  for (const ember of [...sky.embers, ...closed]) {
    const at = screen(ember.id);
    if (!at || (level === 'sky' && !focused(ember.id))) continue;
    items.push({
      id: ember.id,
      text: ember.handle,
      tone: 'ember',
      font: TICKET_FONT,
      at,
      offset: STAR_OFFSET,
      priority: rank(ember.id, PRIORITY.ember),
      dim: dim(ember.id),
      old: false,
    });
  }

  if (shown.fog) {
    for (const placed of layout.fog) {
      const fog = sky.fog.find((f) => f.id === placed.id);
      if (!fog) continue;
      items.push({
        id: fog.id,
        text: level === 'sky' ? trim(fog.head, 24) : fog.head,
        tone: 'fog',
        font: FOG_FONT,
        at: toScreen(placed, camera),
        offset: 0,
        priority:
          selection?.kind === 'fog' && selection.id === fog.id ? PRIORITY.selected : PRIORITY.fog,
        dim: false,
        old: false,
      });
    }
  }
  return items;
}

/** A `.scratch/` System's handle is its folder name, which its title already reads as. */
function systemText(system: System): string {
  return system.number === null ? system.name : `${system.handle}  ${system.name}`;
}

function ticketText(ticket: Ticket, level: ZoomLevel, focused: boolean): string | null {
  const lit = LIT.has(ticket.light);
  const titled = (max: number) => `${ticket.handle}  ${trim(ticket.title, max)}`;
  if (focused) return titled(44);
  if (level === 'sky') return lit ? ticket.handle : null;
  if (level === 'system') return lit ? titled(24) : ticket.handle;
  return titled(36);
}

export function placeLabels(
  items: LabelItem[],
  viewport: Size,
  measure: Measure,
  reserved: Box[] = [],
): Placement {
  const order = items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => a.item.priority - b.item.priority || a.i - b.i);
  const boxes: Box[] = [...reserved];
  const placed: PlacedLabel[] = [];
  const dropped: string[] = [];
  for (const { item } of order) {
    const w = measure(item.text, item.font) + PAD_X * 2;
    const h = item.font.size + 3;
    let onScreen = false;
    let spot: Box | null = null;
    for (const [x, y] of candidates(item.at, w, h, item.offset)) {
      const box = { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 };
      if (box.x1 < 0 || box.x0 > viewport.w || box.y1 < 0 || box.y0 > viewport.h) continue;
      onScreen = true;
      if (!boxes.some((b) => overlaps(b, box))) {
        spot = box;
        break;
      }
    }
    if (spot) {
      boxes.push(spot);
      placed.push({ item, x: (spot.x0 + spot.x1) / 2, y: (spot.y0 + spot.y1) / 2 });
    } else if (onScreen) dropped.push(item.id);
  }
  return { placed, dropped };
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function candidates(p: Point, w: number, h: number, off: number): [number, number][] {
  return [
    [p.x, p.y + off],
    [p.x + w / 2 + off, p.y],
    [p.x, p.y - off],
    [p.x - w / 2 - off, p.y],
    [p.x, p.y + off + h],
  ];
}
