import type { Placed } from '@app/session/place';
import { createStarfield, drawBackground } from '@app/sky/draw/background';
import { drawDisc, drawLooseRing } from '@app/sky/draw/discs';
import { drawDependency } from '@app/sky/draw/edges';
import { drawFog } from '@app/sky/draw/fog';
import type { Frame } from '@app/sky/draw/frame';
import { canvasMeasure, drawLabels } from '@app/sky/draw/labels';
import { DARK, type Palette } from '@app/sky/draw/palette';
import { drawEmber, drawHusk, drawSystem, drawTicket } from '@app/sky/draw/stars';
import { ease, levelAt, TOP_INSET, zoomAround } from './camera';
import { toScreen } from './geometry';
import { framePlan } from './frame-plan';
import { Gesture, type PointerInput } from './gesture';
import { hitTest } from './hit';
import { type Measure, placeLabels, type SkyWords } from './labels';
import { layoutSky } from './layout';
import type { RoutedSky } from './route';
import { gateChanges, pinLayout, PULSE_S, TWEEN_S, tweenedAt, type Tween } from './pin';
import type { Camera, Layout, PlacedStar, Point, Scene, Selection, Size, ZoomLevel } from './types';
import { type Shown, shownIn } from './visibility';
import { skyFit, zoomGoal } from './zoom';

export interface SkyEvents {
  select(selection: Selection): void;
  zoom(level: ZoomLevel): void;
  /** Screen position of the selected star, or `null` when no star is selected or it is hidden. */
  anchor(point: Point | null): void;
}

const WHEEL_RATE = 0.0015;

export class SkyEngine {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly measure: Measure;
  private field = createStarfield();
  private readonly resizer: ResizeObserver;
  private readonly t0 = performance.now();
  private frameId = 0;
  private last = 0;
  private t = 0;
  private dpr = 1;
  private viewport: Size = { w: 0, h: 0 };
  private camera: Camera = { x: 0, y: 0, s: 1 };
  private goal: Camera = { x: 0, y: 0, s: 1 };

  private sky: RoutedSky | null = null;
  private layout: Layout | null = null;
  private selection: Selection = null;
  private route: string | null = null;
  private hidden: ReadonlySet<string> = new Set();
  private shown: Shown | null = null;
  private spinning: ReadonlySet<string> = new Set();
  private sessions: ReadonlyMap<string, Placed> = new Map();
  private words: SkyWords = { stateSuffix: () => '' };
  private palette: Palette = DARK;
  private tweens = new Map<string, Tween>();
  /** Engine seconds each gate change was seen. */
  private pulses = new Map<string, number>();

  private readonly gesture = new Gesture();
  private level: ZoomLevel = 'sky';
  private publishedLevel: ZoomLevel | null = null;
  private anchor: Point | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: SkyEvents,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.measure = canvasMeasure(this.ctx);
    this.resizer = new ResizeObserver(() => this.resize());
    this.resizer.observe(canvas);
    addEventListener('resize', this.onWindowResize);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.resize();
    this.frameId = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.frameId);
    this.resizer.disconnect();
    removeEventListener('resize', this.onWindowResize);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onCancel);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  setSky(sky: RoutedSky | null): void {
    const first = !this.sky;
    const pinned = sky ? pinLayout(this.layout, layoutSky(sky), this.t) : null;
    for (const id of sky ? gateChanges(this.sky, sky) : []) this.pulses.set(id, this.t);
    for (const [id, tween] of this.tweens) if (this.t - tween.t0 > TWEEN_S) this.tweens.delete(id);
    for (const [id, from] of pinned?.moved ?? []) this.tweens.set(id, { from, t0: this.t });
    this.sky = sky;
    this.layout = pinned?.layout ?? null;
    this.updateShown();
    if (first && sky) this.fitSky(true);
  }

  setSelection(selection: Selection): void {
    this.selection = selection;
  }

  setRoute(route: string | null): void {
    this.route = route;
    this.updateShown();
  }

  setHidden(hidden: ReadonlySet<string>): void {
    this.hidden = hidden;
    this.updateShown();
  }

  private updateShown(): void {
    const sky = this.sky;
    this.shown = sky ? shownIn(sky, this.hidden, this.route) : null;
  }

  setSpinning(spinning: ReadonlySet<string>): void {
    this.spinning = spinning;
  }

  setSessions(sessions: ReadonlyMap<string, Placed>): void {
    this.sessions = sessions;
  }

  setWords(words: SkyWords): void {
    this.words = words;
  }

  setPalette(palette: Palette): void {
    if (palette.speckDensity !== this.palette.speckDensity)
      this.field = createStarfield(palette.speckDensity);
    this.palette = palette;
  }

  flyTo(id: string): void {
    this.zoomTo('star', id);
  }

  zoomTo(level: ZoomLevel, id: string | null): void {
    const scene = this.scene();
    if (!scene) return;
    this.level = level;
    this.goal = zoomGoal({ ...scene, camera: this.goal }, level, id);
  }

  /** The scene this frame draws and hit-tests, stars at their tweened points. */
  scene(): Scene | null {
    if (!this.sky || !this.layout || !this.shown) return null;
    return {
      sky: this.sky,
      layout: this.layout,
      camera: this.camera,
      viewport: this.viewport,
      shown: this.shown,
      t: this.t,
      level: this.level,
      where: (id) => this.worldOf(id),
    };
  }

  private worldOf(id: string): Point | null {
    const star = this.layout?.stars.get(id);
    return star ? this.placed(id, star) : null;
  }

  private placed(id: string, star: PlacedStar): Point {
    return tweenedAt(star, this.tweens.get(id), this.t);
  }

  /** Drops each pulse whose ring has gone out. */
  private pulsePhases(): Map<string, number> {
    const phases = new Map<string, number>();
    for (const [id, t0] of this.pulses) {
      const k = (this.t - t0) / PULSE_S;
      if (k < 1) phases.set(id, k);
      else this.pulses.delete(id);
    }
    return phases;
  }

  private fitSky(snap: boolean): void {
    this.zoomTo('sky', null);
    if (snap) this.camera = { ...this.goal };
  }

  /** Keeps the world point at the centre where it was, so the panel opening does not jolt the sky. */
  private resize(): void {
    const box = this.canvas.getBoundingClientRect();
    const unsized = this.viewport.w === 0 || this.viewport.h === 0;
    const dx = (box.width - this.viewport.w) / 2;
    const dy = (box.height - this.viewport.h) / 2;
    this.camera = { ...this.camera, x: this.camera.x + dx, y: this.camera.y + dy };
    this.goal = { ...this.goal, x: this.goal.x + dx, y: this.goal.y + dy };
    this.dpr = devicePixelRatio || 1;
    this.viewport = { w: box.width, h: box.height };
    this.canvas.width = Math.round(box.width * this.dpr);
    this.canvas.height = Math.round(box.height * this.dpr);
    if (unsized) this.fitSky(true);
  }

  private readonly onWindowResize = (): void => {
    this.resize();
    this.fitSky(true);
  };

  private readonly frame = (now: number): void => {
    this.frameId = requestAnimationFrame(this.frame);
    if ((devicePixelRatio || 1) !== this.dpr) this.resize();
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    this.t = (now - this.t0) / 1000;
    if (!this.gesture.active) this.camera = ease(this.camera, this.goal, dt);
    this.draw();
    this.publish();
  };

  private draw(): void {
    const { ctx, camera, viewport } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawBackground(ctx, this.field, viewport, camera, this.palette);
    const scene = this.scene();
    if (!scene) return;
    const plan = framePlan(scene, {
      selection: this.selection,
      spinning: this.spinning,
      pulses: this.pulsePhases(),
      sessions: this.sessions,
      words: this.words,
    });

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.s, camera.s);
    const f: Frame = { ctx, palette: this.palette, s: camera.s, t: this.t };
    for (const { disc, system } of plan.discs) drawDisc(f, disc, system);
    if (plan.looseRing !== null) drawLooseRing(f, plan.looseRing);
    for (const { patch, selected } of plan.fog) drawFog(f, patch, selected);
    for (const line of plan.lines) {
      const { selected, ontoSystem } = line;
      drawDependency(f, line.dep, line.a, line.b, { dim: line.alpha, selected, ontoSystem });
    }
    for (const star of plan.stars) {
      if (star.kind === 'system') drawSystem(f, star.system, star.at, star);
      else if (star.kind === 'ticket') drawTicket(f, star.ticket, star.at, star);
      else if (star.kind === 'husk') drawHusk(f, star.at, star);
      else drawEmber(f, star.id, star.at, star);
    }
    ctx.restore();

    const controls = { x0: 0, x1: viewport.w, y0: 0, y1: TOP_INSET };
    drawLabels(
      ctx,
      placeLabels(plan.labels, viewport, this.measure, [controls]).placed,
      this.palette,
    );
  }

  private publish(): void {
    if (this.level !== this.publishedLevel) {
      this.publishedLevel = this.level;
      this.events.zoom(this.level);
    }
    const s = this.selection;
    const world = s?.kind === 'star' && this.shown?.star(s.id) ? this.worldOf(s.id) : null;
    const anchor = world ? toScreen(world, this.camera) : null;
    const moved =
      !anchor || !this.anchor
        ? anchor !== this.anchor
        : Math.abs(anchor.x - this.anchor.x) > 0.5 || Math.abs(anchor.y - this.anchor.y) > 0.5;
    if (moved) {
      this.anchor = anchor;
      this.events.anchor(anchor);
    }
  }

  private pointer(e: PointerEvent | WheelEvent): Point {
    const box = this.canvas.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  private input(e: PointerEvent): PointerInput {
    return { id: e.pointerId, at: this.pointer(e) };
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.gesture.down(this.input(e), { ...this.goal });
    this.canvas.setPointerCapture(e.pointerId);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.gesture.active) {
      const scene = this.scene();
      this.canvas.style.cursor = scene && hitTest(scene, this.pointer(e)) ? 'pointer' : '';
      return;
    }
    const action = this.gesture.move(this.input(e));
    if (action?.kind !== 'camera') return;
    this.canvas.style.cursor = 'grabbing';
    this.goal = action.camera;
    this.camera = { ...this.goal };
    const scene = this.scene();
    if (scene) this.level = levelAt(this.goal.s, skyFit(scene).s);
  };

  private readonly onUp = (e: PointerEvent): void => {
    const action = this.gesture.up(this.input(e));
    this.canvas.style.cursor = '';
    if (action?.kind !== 'tap') return;
    const scene = this.scene();
    this.events.select(scene ? hitTest(scene, action.at) : null);
  };

  private readonly onCancel = (): void => {
    this.gesture.cancel();
    this.canvas.style.cursor = '';
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.goal = zoomAround(this.goal, this.pointer(e), Math.exp(-e.deltaY * WHEEL_RATE));
    const scene = this.scene();
    if (scene) this.level = levelAt(this.goal.s, skyFit(scene).s);
  };
}
