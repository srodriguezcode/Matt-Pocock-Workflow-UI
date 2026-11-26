import { describe, expect, it } from 'vitest';
import { drop, inside, move, moved, offset, press, TileDrag } from './drag';

const PITCH = 48;
const pressAt = (from: number) => press(from, 4, PITCH, 100);

describe('a press on a Rail tile', () => {
  it('stays a click under the threshold and moves nothing', () => {
    const drag = move(pressAt(1), 104);
    expect(drag.dragging).toBe(false);
    expect([0, 1, 2, 3].map((i) => offset(drag, i))).toEqual([0, 0, 0, 0]);
    expect(drop(drag, true)).toBeNull();
  });

  it('turns into a drag at 5 px and stays one back at its start', () => {
    const drag = move(move(pressAt(1), 95), 100);
    expect(drag.dragging).toBe(true);
    expect(drop(drag, true)).toBeNull();
  });
});

describe('a drag along the Rail', () => {
  it('lets the tile follow the pointer and opens a gap below', () => {
    const drag = move(pressAt(0), 100 + 2 * PITCH + 10);
    expect([0, 1, 2, 3].map((i) => offset(drag, i))).toEqual([2 * PITCH + 10, -PITCH, -PITCH, 0]);
    expect(drop(drag, true)).toEqual({ from: 0, to: 2 });
  });

  it('opens a gap above when dragged up', () => {
    const drag = move(pressAt(3), 100 - PITCH);
    expect([0, 1, 2, 3].map((i) => offset(drag, i))).toEqual([0, 0, PITCH, -PITCH]);
    expect(drop(drag, true)).toEqual({ from: 3, to: 2 });
  });

  it('stops at the ends of the Rail', () => {
    expect(drop(move(pressAt(1), 100 + 10 * PITCH), true)).toEqual({ from: 1, to: 3 });
    expect(drop(move(pressAt(1), 100 - 10 * PITCH), true)).toEqual({ from: 1, to: 0 });
  });

  it('makes no move on a release off the Rail', () => {
    expect(drop(move(pressAt(0), 100 + PITCH), false)).toBeNull();
  });
});

describe('moved', () => {
  it('takes the item out and puts it in at the drop index', () => {
    expect(moved(['a', 'b', 'c', 'd'], { from: 0, to: 2 })).toEqual(['b', 'c', 'a', 'd']);
    expect(moved(['a', 'b', 'c', 'd'], { from: 3, to: 1 })).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('a TileDrag', () => {
  const click = { detail: 1 };
  const keyboardClick = { detail: 0 };

  it('lets a click without movement select the repo', () => {
    const drag = new TileDrag();
    drag.press(1, 4, PITCH, 100);
    drag.move(102);
    expect(drag.release(true)).toBeNull();
    expect(drag.selects(click)).toBe(true);
  });

  it('swallows the click that ends a drag, and only that one', () => {
    const drag = new TileDrag();
    drag.press(0, 4, PITCH, 100);
    drag.move(100 + PITCH);
    expect(drag.release(true)).toEqual({ from: 0, to: 1 });
    expect(drag.selects(click)).toBe(false);
    expect(drag.selects(click)).toBe(true);
  });

  it('never swallows a keyboard click, even after a drag', () => {
    const drag = new TileDrag();
    drag.press(0, 4, PITCH, 100);
    drag.move(100 + PITCH);
    drag.release(false);
    expect(drag.selects(keyboardClick)).toBe(true);
  });

  it('on cancel puts every tile back and makes no move on the release after it', () => {
    const drag = new TileDrag();
    drag.press(0, 4, PITCH, 100);
    drag.move(100 + 2 * PITCH);
    expect(drag.transform(0)).toBe(`translateY(${2 * PITCH}px)`);
    drag.cancel();
    expect([0, 1, 2, 3].map((i) => drag.transform(i))).toEqual([null, null, null, null]);
    expect(drag.release(true)).toBeNull();
    expect(drag.selects(click)).toBe(false);
  });
});

describe('inside', () => {
  const rail = { left: 0, right: 60, top: 0, bottom: 800 };

  it('takes the edges of the Rail as on it', () => {
    expect(inside(rail, 60, 800)).toBe(true);
    expect(inside(rail, 61, 400)).toBe(false);
  });
});
