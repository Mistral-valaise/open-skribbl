import type { Clock } from '../clock.js';

/** A clock that only moves when a test calls `advance`. */
export class ManualClock implements Clock {
  private time: number;
  private timers: { at: number; seq: number; fn: () => void }[] = [];
  private seq = 0;

  constructor(start = 1_000_000) {
    this.time = start;
  }

  now(): number {
    return this.time;
  }

  setTimer(at: number, fn: () => void): () => void {
    const timer = { at, seq: this.seq++, fn };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((other) => other !== timer);
    };
  }

  /** Moves time forward, firing due timers in order (including ones they schedule). */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const next = this.timers
        .filter((timer) => timer.at <= target)
        .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!next) break;
      this.timers = this.timers.filter((timer) => timer !== next);
      this.time = Math.max(this.time, next.at);
      next.fn();
    }
    this.time = target;
  }
}
