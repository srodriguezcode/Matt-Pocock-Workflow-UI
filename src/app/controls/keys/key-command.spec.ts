import { describe, expect, it } from 'vitest';
import { type FocusKind, keyCommand, type Layers } from './key-command';

const bare: Layers = { popup: false, sheet: false, running: false, selected: false, zoom: 'sky' };

const press = (key: string, focus: FocusKind = 'none', layers: Partial<Layers> = {}) =>
  keyCommand({ key, ctrlKey: false, metaKey: false, altKey: false }, focus, { ...bare, ...layers });

describe('Escape', () => {
  const all: Layers = { popup: true, sheet: true, running: false, selected: true, zoom: 'star' };

  it('closes one layer per press: popup, sheet, selection, then back to sky zoom', () => {
    expect(press('Escape', 'none', all)).toEqual({ do: 'close-popup' });
    expect(press('Escape', 'none', { ...all, popup: false })).toEqual({ do: 'close-sheet' });
    expect(press('Escape', 'none', { ...all, popup: false, sheet: false })).toEqual({
      do: 'deselect',
    });
    expect(press('Escape', 'none', { zoom: 'star' })).toEqual({ do: 'zoom', level: 'sky' });
    expect(press('Escape')).toBeNull();
  });

  it('holds the sheet while a launch runs, never reaching past it', () => {
    const layers = { ...all, popup: false, running: true };
    expect(press('Escape', 'none', layers)).toEqual({ do: 'hold-sheet' });
  });

  it('still closes a popup while a launch runs', () => {
    expect(press('Escape', 'none', { ...all, running: true })).toEqual({ do: 'close-popup' });
  });

  it('reaches out of a checkbox or the Base selector, but not out of a text field', () => {
    expect(press('Escape', 'field', { popup: true })).toEqual({ do: 'close-popup' });
    expect(press('Escape', 'text', { popup: true })).toBeNull();
  });
});

describe('keys', () => {
  it('maps each key to its command', () => {
    expect(press('n')).toEqual({ do: 'step', dir: 1 });
    expect(press('N')).toEqual({ do: 'step', dir: -1 });
    expect(press('ArrowLeft')).toEqual({ do: 'move', direction: 'left' });
    expect(press('ArrowDown')).toEqual({ do: 'move', direction: 'down' });
    expect(press('Enter')).toEqual({ do: 'enter' });
    expect(press('r')).toEqual({ do: 'refresh' });
    expect(press('f')).toEqual({ do: 'filter' });
    expect(press('t')).toEqual({ do: 'theme' });
    expect(press('?')).toEqual({ do: 'keys' });
    expect(press('1')).toEqual({ do: 'zoom', level: 'sky' });
    expect(press('2')).toEqual({ do: 'zoom', level: 'system' });
    expect(press('3')).toEqual({ do: 'zoom', level: 'star' });
  });

  it('does nothing while typing in a field', () => {
    for (const key of ['n', 'r', 'f', 't', '?', '1', 'Enter', 'ArrowUp']) {
      expect(press(key, 'text')).toBeNull();
      expect(press(key, 'field')).toBeNull();
    }
  });

  it('leaves Enter to a focused button, so the Start button fires once', () => {
    expect(press('Enter', 'control')).toBeNull();
    expect(press('n', 'control')).toEqual({ do: 'step', dir: 1 });
  });

  it('leaves browser shortcuts alone', () => {
    const reload = { key: 'r', ctrlKey: false, metaKey: true, altKey: false };
    expect(keyCommand(reload, 'none', bare)).toBeNull();
  });

  it('has no key for Release', () => {
    const keys = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'Delete'];
    const commands = keys.map((key) => press(key)?.do).filter((d) => d !== undefined);
    expect(new Set(commands)).toEqual(new Set(['step', 'zoom', 'refresh', 'filter', 'theme']));
  });
});
