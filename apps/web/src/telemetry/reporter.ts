import { RUM, rumReportSchema, type RumEvent } from '@kritzel/shared';

/**
 * Collects measurement events and sends them in reports the server accepts
 * (spec 015, "Browser measurements"): at most `RUM.maxEvents` events and
 * `RUM.maxBytes` bytes each, and far fewer reports than the server's limit.
 */

/** A send that follows a timing event waits this long, so a burst becomes one report. */
export const SEND_DELAY_MS = 2_000;
/** A third of what the server allows per address, which several players may share. */
export const REPORTS_PER_MINUTE = RUM.reportsPerMinute / 3;
/** Events waiting to be sent; a full queue drops the newest one. */
export const QUEUE_LIMIT = 2 * RUM.maxEvents;

const MINUTE_MS = 60_000;

/** What the reporter needs from its surroundings; tests supply a manual clock. */
export interface ReporterEnv {
  /** Posts one report. It must not throw; a report that fails is lost. */
  send: (body: string) => void;
  /** Milliseconds on a clock that never goes back. */
  now: () => number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

export interface BatchLimits {
  maxEvents: number;
  maxBytes: number;
}

const encoder = new TextEncoder();

/**
 * The report for the longest run of events from the front of the queue that
 * fits the limits, and how many events it holds; null when there is none.
 */
export function takeBatch(
  queue: readonly RumEvent[],
  limits: BatchLimits = RUM,
): { body: string; count: number } | null {
  for (let count = Math.min(queue.length, limits.maxEvents); count > 0; count -= 1) {
    const body = JSON.stringify({ events: queue.slice(0, count) });
    if (encoder.encode(body).length <= limits.maxBytes) return { body, count };
  }
  return null;
}

export class Reporter {
  private queue: RumEvent[] = [];
  private timer: unknown = null;
  /** When the reports of the last minute were sent. */
  private sentAt: number[] = [];

  constructor(private readonly env: ReporterEnv) {}

  /** Queues an event. The shared report schema is the gate: what it refuses is dropped here. */
  add(event: RumEvent): void {
    if (this.queue.length >= QUEUE_LIMIT) return;
    if (!rumReportSchema.safeParse({ events: [event] }).success) return;
    this.queue.push(event);
  }

  /** Sends what is queued shortly; calling again within the delay starts the wait anew. */
  flushSoon(): void {
    this.cancelTimer();
    this.timer = this.env.setTimer(() => {
      this.timer = null;
      this.flush();
    }, SEND_DELAY_MS);
  }

  /** Sends what is queued now. Events beyond this minute's reports stay queued. */
  flush(): void {
    this.cancelTimer();
    while (this.queue.length > 0) {
      const now = this.env.now();
      this.sentAt = this.sentAt.filter((time) => now - time < MINUTE_MS);
      if (this.sentAt.length >= REPORTS_PER_MINUTE) return;
      const batch = takeBatch(this.queue);
      if (!batch) {
        // Cannot happen with events the schema accepts; drop the event instead of spinning.
        this.queue.shift();
        continue;
      }
      this.queue.splice(0, batch.count);
      this.sentAt.push(now);
      this.env.send(batch.body);
    }
  }

  /** Forgets everything that was not sent yet. */
  discard(): void {
    this.cancelTimer();
    this.queue = [];
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.env.clearTimer(this.timer);
    this.timer = null;
  }
}
