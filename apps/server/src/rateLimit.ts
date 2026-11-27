/** Token bucket: `burst` tokens, refilled at `perSecond`. */
export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly burst: number,
    private readonly perSecond: number,
    now: number,
  ) {
    this.tokens = burst;
    this.updatedAt = now;
  }

  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.updatedAt) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.perSecond);
    this.updatedAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Counts events in a sliding window; used to close abusive connections. */
export class WindowCounter {
  private stamps: number[] = [];

  constructor(private readonly windowMs: number) {}

  add(now: number): number {
    this.stamps = this.stamps.filter((stamp) => now - stamp < this.windowMs);
    this.stamps.push(now);
    return this.stamps.length;
  }
}
