import { effect, inject, Injectable, untracked } from '@angular/core';
import { Board } from './board';
import { type ClockState, nextPollAt, planFor, type Trigger } from './refresh-schedule';

/** Re-reads the sky on its own. Any read, own writes included, restarts the poll timer. */
@Injectable({ providedIn: 'root' })
export class RefreshClock {
  private readonly board = inject(Board);
  private settledAt = Date.now();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor() {
    effect(() => {
      this.board.skyResponse();
      this.board.readFailure();
      untracked(() => this.settle());
    });
  }

  start(): () => void {
    this.running = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    addEventListener('focus', this.onFocus);
    this.schedule();
    return () => {
      this.running = false;
      clearTimeout(this.timer);
      document.removeEventListener('visibilitychange', this.onVisibility);
      removeEventListener('focus', this.onFocus);
    };
  }

  refresh(): void {
    this.fire('manual');
  }

  private fire(trigger: Trigger): void {
    const plan = planFor(trigger, this.state(), Date.now());
    if (plan.gaps) void this.board.checkGaps();
    if (plan.read) void this.read(trigger === 'manual');
    else this.schedule();
  }

  private async read(fresh: boolean): Promise<void> {
    await this.board.readSky({ fresh });
    this.settle();
  }

  private settle(): void {
    this.settledAt = Date.now();
    this.schedule();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (!this.running || document.visibilityState !== 'visible') return;
    const wait = Math.max(0, nextPollAt(this.state()) - Date.now());
    this.timer = setTimeout(() => this.fire('tick'), wait);
  }

  private state(): ClockState {
    return {
      settledAt: this.settledAt,
      failed: this.board.readFailure() !== null,
      reading: this.board.reading(),
      visible: document.visibilityState === 'visible',
    };
  }

  private readonly onVisibility = (): void => this.fire('visible');
  private readonly onFocus = (): void => this.fire('focus');
}
