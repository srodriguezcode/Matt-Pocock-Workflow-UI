import type { Camera, Point } from './types';

export interface PointerInput {
  id: number;
  at: Point;
}

export type GestureAction = { kind: 'camera'; camera: Camera } | { kind: 'tap'; at: Point };

/** Screen px a pointer may drift and still count as a tap. */
export const TAP_SLOP = 3;

export class Gesture {
  private pointer: PointerInput | null = null;
  private base: Camera = { x: 0, y: 0, s: 1 };
  private origin: Point = { x: 0, y: 0 };
  private moved = false;

  get active(): boolean {
    return this.pointer !== null;
  }

  down(input: PointerInput, camera: Camera): void {
    if (this.pointer) return;
    this.pointer = input;
    this.base = camera;
    this.origin = input.at;
    this.moved = false;
  }

  move(input: PointerInput): GestureAction | null {
    if (this.pointer?.id !== input.id) return null;
    const dx = input.at.x - this.origin.x;
    const dy = input.at.y - this.origin.y;
    if (!this.moved && Math.hypot(dx, dy) <= TAP_SLOP) return null;
    this.moved = true;
    return { kind: 'camera', camera: { ...this.base, x: this.base.x + dx, y: this.base.y + dy } };
  }

  up(input: PointerInput): GestureAction | null {
    if (this.pointer?.id !== input.id) return null;
    this.pointer = null;
    return this.moved ? null : { kind: 'tap', at: input.at };
  }

  cancel(): void {
    this.pointer = null;
  }
}
