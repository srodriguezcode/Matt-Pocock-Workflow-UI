import { describe, expect, it } from 'vitest';
import { englishMessages } from '@app/i18n/messages.en';
import { withRoute } from '@app/sky/engine/route';
import { harborSky, withClosedRoute } from '@app/sky/testing/harbor-sky';
import { filterRows, stillShown, toggleAll } from './filter-rows';

const sky = withRoute(harborSky(), null);
const filter = englishMessages.board.filter;

describe('filterRows', () => {
  it('lists every System, then Loose tickets, tinted by kind and gate', () => {
    const rows = filterRows(sky, new Set(), filter);
    expect(rows.map((r) => r.key)).toEqual([...sky.systems.map((s) => s.id), 'loose']);
    expect(rows.find((r) => r.key === '512')).toMatchObject({ tone: 'map', shown: true });
    expect(rows.find((r) => r.key === '558')!.tone).toBe('gated');
    expect(rows.find((r) => r.key === '602')).toMatchObject({
      name: 'the Podcast section',
      tone: 'system',
      count: 11,
    });
    expect(rows.at(-1)).toMatchObject({ name: 'Loose tickets', tone: 'loose' });
  });

  it('leaves out the Loose tickets row when the Sky has none', () => {
    const tied = withRoute(
      { ...sky, tickets: sky.tickets.filter((t) => t.systemId !== null) },
      null,
    );
    expect(filterRows(tied, new Set(), filter).map((r) => r.key)).toEqual(
      sky.systems.map((s) => s.id),
    );
  });

  it('unchecks the hidden keys', () => {
    const rows = filterRows(sky, new Set(['602', 'loose']), filter);
    expect(rows.filter((r) => !r.shown).map((r) => r.key)).toEqual(['602', 'loose']);
  });
});

describe('toggleAll', () => {
  it('unmarks every row while any is shown, and marks all once none is', () => {
    const all = toggleAll(filterRows(sky, new Set(['602']), filter));
    expect(all.size).toBe(sky.systems.length + 1);
    expect(toggleAll(filterRows(sky, all, filter)).size).toBe(0);
  });
});

describe('stillShown', () => {
  const hidden = new Set(['602']);

  it('drops a selected star or line inside a hidden System', () => {
    expect(stillShown(sky, { kind: 'star', id: '633' }, hidden, null)).toBe(false);
    expect(stillShown(sky, { kind: 'line', id: '602->558' }, hidden, null)).toBe(false);
    expect(stillShown(sky, { kind: 'star', id: '559' }, hidden, null)).toBe(true);
    expect(stillShown(sky, null, hidden, null)).toBe(true);
  });

  it('keeps a selected closed ticket until its System is hidden', () => {
    const routed = withClosedRoute(sky);
    expect(stillShown(routed, { kind: 'star', id: '291' }, hidden, '292')).toBe(true);
    expect(stillShown(routed, { kind: 'line', id: '290->291' }, hidden, '292')).toBe(true);
    expect(stillShown(routed, { kind: 'star', id: '291' }, new Set(['292']), '292')).toBe(false);
  });

  it('drops selected Fog with the Map', () => {
    expect(stillShown(sky, { kind: 'fog', id: 'fog-1' }, new Set(['512']), null)).toBe(false);
    expect(stillShown(sky, { kind: 'fog', id: 'fog-1' }, hidden, null)).toBe(true);
  });
});
