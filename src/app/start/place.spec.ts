import { describe, expect, it } from 'vitest';
import { placeCornerSheet, placePill, placeSheet, stageBounds } from './place';

const pill = { w: 80, h: 22 };
const bounds = { right: 1000, bottom: 700 };

describe('placePill', () => {
  it('sits right of and above the star', () => {
    expect(placePill({ x: 300, y: 200 }, pill, bounds)).toEqual({ x: 322, y: 187 });
  });

  it('stays out of the panel and inside the stage', () => {
    expect(placePill({ x: 990, y: 5 }, pill, bounds)).toEqual({ x: 910, y: 10 });
    expect(placePill({ x: -50, y: 900 }, pill, bounds)).toEqual({ x: 10, y: 668 });
  });
});

describe('placeSheet', () => {
  it('sits below the pill, clamped under the controls and inside the stage', () => {
    const sheet = { w: 420, h: 300 };
    expect(placeSheet({ x: 300, y: 200 }, sheet, bounds)).toEqual({ x: 322, y: 221 });
    expect(placeSheet({ x: 900, y: 10 }, sheet, bounds)).toEqual({ x: 570, y: 60 });
    expect(placeSheet({ x: 300, y: 650 }, sheet, bounds)).toEqual({ x: 322, y: 390 });
  });
});

describe('placeCornerSheet', () => {
  it('hangs from the top-right corner, under the corner button', () => {
    expect(placeCornerSheet({ w: 420, h: 300 }, bounds)).toEqual({ x: 570, y: 60 });
  });
});

describe('stageBounds', () => {
  const stage = { left: 58, right: 1458, top: 0, width: 1400, height: 800 };

  it('ends at the panel where the panel covers the stage', () => {
    const panel = { left: 898, right: 1458, top: 0, width: 560, height: 800 };
    expect(stageBounds(stage, panel)).toEqual({ right: 840, bottom: 800 });
  });

  it('uses the whole stage when the panel is closed or beside it', () => {
    expect(stageBounds(stage, { left: 1458, right: 1458, top: 0, width: 0, height: 800 })).toEqual({
      right: 1400,
      bottom: 800,
    });
    expect(
      stageBounds(stage, { left: 1458, right: 2018, top: 0, width: 560, height: 800 }),
    ).toEqual({
      right: 1400,
      bottom: 800,
    });
    expect(stageBounds(stage, null)).toEqual({ right: 1400, bottom: 800 });
  });
});
