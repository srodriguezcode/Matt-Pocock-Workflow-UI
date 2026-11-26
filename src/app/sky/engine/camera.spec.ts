import { describe, expect, it } from 'vitest';
import { ease, fitCamera, levelAt, zoomAround } from './camera';
import { toScreen, toWorld } from './geometry';

describe('camera', () => {
  it('reads the wheel as sky up to just past the sky fit, then by scale', () => {
    expect(levelAt(0.3, 0.2)).toBe('sky');
    expect(levelAt(0.45, 0.2)).toBe('system');
    expect(levelAt(1.14, 0.2)).toBe('system');
    expect(levelAt(1.15, 0.2)).toBe('star');
    expect(levelAt(1.5, 1.5)).toBe('sky');
    expect(levelAt(1.6, 0.8)).toBe('star');
  });

  it('fits every point inside the viewport', () => {
    const viewport = { w: 1000, h: 700 };
    const points = [
      { x: -900, y: -300 },
      { x: 1200, y: 800 },
    ];
    const camera = fitCamera(points, viewport, 50);
    for (const p of points) {
      const s = toScreen(p, camera);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(viewport.w);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(viewport.h);
    }
  });

  it('zooms around the cursor, keeping the world point under it', () => {
    const camera = { x: 100, y: 50, s: 0.5 };
    const cursor = { x: 420, y: 310 };
    const zoomed = zoomAround(camera, cursor, 1.8);
    expect(zoomed.s).toBeCloseTo(0.9);
    const before = toWorld(cursor, camera);
    const after = toWorld(cursor, zoomed);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('eases the same distance whatever the frame rate', () => {
    const from = { x: 0, y: 0, s: 1 };
    const goal = { x: 100, y: 0, s: 1 };
    let fast = from;
    for (let i = 0; i < 4; i++) fast = ease(fast, goal, 1 / 120);
    const slow = ease(ease(from, goal, 1 / 60), goal, 1 / 60);
    expect(fast.x).toBeCloseTo(slow.x);
    expect(slow.x).toBeGreaterThan(40);
    expect(slow.x).toBeLessThan(100);
  });
});
