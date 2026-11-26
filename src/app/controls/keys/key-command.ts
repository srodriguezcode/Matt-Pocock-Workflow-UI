import type { Direction } from '@app/sky/engine/nav';
import type { ZoomLevel } from '@app/sky/engine/types';

export type KeyCommand =
  | { do: 'close-popup' }
  | { do: 'hold-sheet' }
  | { do: 'close-sheet' }
  | { do: 'deselect' }
  | { do: 'zoom'; level: ZoomLevel }
  | { do: 'step'; dir: 1 | -1 }
  | { do: 'move'; direction: Direction }
  | { do: 'enter' }
  | { do: 'refresh' }
  | { do: 'filter' }
  | { do: 'theme' }
  | { do: 'keys' };

/**
 * `text` takes every key. `field` keeps its own keys but lets Escape through.
 * `control` keeps Enter, which clicks it.
 */
export type FocusKind = 'text' | 'field' | 'control' | 'none';

export interface Pressed {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export interface Layers {
  popup: boolean;
  sheet: boolean;
  running: boolean;
  selected: boolean;
  zoom: ZoomLevel;
}

const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const ZOOMS: Record<string, ZoomLevel> = { '1': 'sky', '2': 'system', '3': 'star' };

export function keyCommand(pressed: Pressed, focus: FocusKind, layers: Layers): KeyCommand | null {
  if (pressed.ctrlKey || pressed.metaKey || pressed.altKey || focus === 'text') return null;
  const { key } = pressed;
  if (key === 'Escape') return escapeCommand(layers);
  if (focus === 'field') return null;
  if (key === 'Enter') return focus === 'control' ? null : { do: 'enter' };
  if (key === 'n' || key === 'N') return { do: 'step', dir: key === 'n' ? 1 : -1 };
  if (key in ARROWS) return { do: 'move', direction: ARROWS[key]! };
  if (key in ZOOMS) return { do: 'zoom', level: ZOOMS[key]! };
  if (key === 'r') return { do: 'refresh' };
  if (key === 'f') return { do: 'filter' };
  if (key === 't') return { do: 'theme' };
  if (key === '?') return { do: 'keys' };
  return null;
}

function escapeCommand(layers: Layers): KeyCommand | null {
  if (layers.popup) return { do: 'close-popup' };
  if (layers.sheet) return { do: layers.running ? 'hold-sheet' : 'close-sheet' };
  if (layers.selected) return { do: 'deselect' };
  if (layers.zoom !== 'sky') return { do: 'zoom', level: 'sky' };
  return null;
}

const TEXT_INPUTS = new Set([
  'text',
  'search',
  'url',
  'email',
  'tel',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
]);

export function focusKind(el: Element | null): FocusKind {
  if (!el) return 'none';
  if (el instanceof HTMLElement && el.isContentEditable) return 'text';
  if (el instanceof HTMLTextAreaElement) return 'text';
  if (el instanceof HTMLInputElement) return TEXT_INPUTS.has(el.type) ? 'text' : 'field';
  if (el instanceof HTMLSelectElement) return 'field';
  if (el.closest('button, a[href], summary, [role="button"]')) return 'control';
  return 'none';
}
