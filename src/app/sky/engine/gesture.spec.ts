import { describe, expect, it } from 'vitest';
import { Gesture, type GestureAction } from './gesture';
import type { Camera } from './types';

const CAMERA: Camera = { x: 100, y: 50, s: 1 };

function pointer(id: number, x: number, y: number) {
  return { id, at: { x, y } };
}

function cameraOf(action: GestureAction | null): Camera {
  if (action?.kind !== 'camera') throw new Error('expected a camera action');
  return action.camera;
}

describe('gesture', () => {
  it('pans the camera with one pointer', () => {
    const g = new Gesture();
    g.down(pointer(1, 200, 200), CAMERA);
    expect(cameraOf(g.move(pointer(1, 230, 180)))).toEqual({ x: 130, y: 30, s: 1 });
  });

  it('selects at the point when the pointer stays put', () => {
    const g = new Gesture();
    g.down(pointer(1, 200, 200), CAMERA);
    expect(g.move(pointer(1, 201, 201))).toBeNull();
    expect(g.up(pointer(1, 201, 201))).toEqual({ kind: 'tap', at: { x: 201, y: 201 } });
  });

  it('pans past the 3 px slop', () => {
    const g = new Gesture();
    g.down(pointer(1, 200, 200), CAMERA);
    expect(g.move(pointer(1, 208, 200))?.kind).toBe('camera');
  });

  it('does not select after a pan', () => {
    const g = new Gesture();
    g.down(pointer(1, 200, 200), CAMERA);
    g.move(pointer(1, 260, 200));
    expect(g.up(pointer(1, 260, 200))).toBeNull();
  });

  it('ignores a second pointer', () => {
    const g = new Gesture();
    g.down(pointer(1, 200, 200), CAMERA);
    g.down(pointer(2, 300, 200), CAMERA);
    expect(g.move(pointer(2, 400, 200))).toBeNull();
    expect(cameraOf(g.move(pointer(1, 230, 200))).s).toBe(1);
  });

  it('ignores moves with no pointer down and goes idle on cancel', () => {
    const g = new Gesture();
    expect(g.move(pointer(1, 5, 5))).toBeNull();
    g.down(pointer(1, 5, 5), CAMERA);
    expect(g.active).toBe(true);
    g.cancel();
    expect(g.active).toBe(false);
  });
});
