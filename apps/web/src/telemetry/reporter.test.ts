import { RUM, rumReportSchema, type RumEvent } from '@kritzel/shared';
import { describe, expect, it } from 'vitest';
import {
  QUEUE_LIMIT,
  REPORTS_PER_MINUTE,
  Reporter,
  SEND_DELAY_MS,
  takeBatch,
  type ReporterEnv,
} from './reporter.js';

const error: RumEvent = { type: 'error', kind: 'error' };
const timing = (durationMs: number): RumEvent => ({
  type: 'timing',
  name: 'join',
  outcome: 'ok',
  durationMs,
  traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
});
const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** A clock and timers that move only when the test says so, and a record of what was sent. */
function fakeEnv() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  const sent: string[] = [];
  const env: ReporterEnv = {
    send: (body) => void sent.push(body),
    now: () => now,
    setTimer: (run, ms) => {
      timers.set(nextId, { at: now + ms, run });
      return nextId++;
    },
    clearTimer: (handle) => void timers.delete(handle as number),
  };
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= until)
        .sort(([, a], [, b]) => a.at - b.at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].run();
    }
    now = until;
  };
  const reports = () => sent.map((body) => rumReportSchema.parse(JSON.parse(body)));
  return { env, sent, reports, advance, pendingTimers: () => timers.size };
}

describe('batches', () => {
  it('AC-015-26: a batch holds at most 20 events', () => {
    const queue = Array.from({ length: RUM.maxEvents + 5 }, () => error);
    const batch = takeBatch(queue)!;
    expect(batch.count).toBe(RUM.maxEvents);
    expect(rumReportSchema.parse(JSON.parse(batch.body)).events).toHaveLength(RUM.maxEvents);
  });

  it('AC-015-26: a full batch of the largest events stays within 4 KiB', () => {
    const longest: RumEvent = {
      type: 'timing',
      name: 'reconnect',
      outcome: 'failed',
      durationMs: RUM.maxDurationMs,
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    };
    const batch = takeBatch(Array.from({ length: RUM.maxEvents }, () => longest))!;
    expect(batch.count).toBe(RUM.maxEvents);
    expect(byteLength(batch.body)).toBeLessThanOrEqual(RUM.maxBytes);
  });

  it('AC-015-26: a batch is cut to the byte limit, and the rest waits for the next one', () => {
    const queue = Array.from({ length: 10 }, (_, index) => timing(index));
    const limits = { maxEvents: RUM.maxEvents, maxBytes: 400 };
    const batch = takeBatch(queue, limits)!;
    expect(batch.count).toBeGreaterThan(0);
    expect(batch.count).toBeLessThan(10);
    expect(byteLength(batch.body)).toBeLessThanOrEqual(400);
    expect(JSON.parse(batch.body)).toEqual({ events: queue.slice(0, batch.count) });
    // One more event would not have fitted.
    const larger = JSON.stringify({ events: queue.slice(0, batch.count + 1) });
    expect(byteLength(larger)).toBeGreaterThan(400);
  });

  it('AC-015-26: nothing to send gives no batch', () => {
    expect(takeBatch([])).toBeNull();
    expect(takeBatch([timing(1)], { maxEvents: RUM.maxEvents, maxBytes: 10 })).toBeNull();
  });
});

describe('the reporter', () => {
  it('AC-015-27: events wait in the queue until a flush', () => {
    const { env, sent, reports, advance } = fakeEnv();
    const reporter = new Reporter(env);
    reporter.add(error);
    reporter.add({ type: 'layout_shift', value: 0.01 });
    advance(60_000);
    expect(sent).toEqual([]);
    reporter.flush();
    expect(reports()).toEqual([{ events: [error, { type: 'layout_shift', value: 0.01 }] }]);
    reporter.flush();
    expect(sent).toHaveLength(1);
  });

  it('AC-015-25: an event the report schema does not allow is never queued', () => {
    const { env, sent } = fakeEnv();
    const reporter = new Reporter(env);
    reporter.add({ type: 'web_vital', name: 'lcp', value: Number.NaN });
    reporter.add({ type: 'web_vital', name: 'inp', value: RUM.maxDurationMs + 1 });
    reporter.add({ type: 'layout_shift', value: -1 });
    reporter.add({ type: 'error', kind: 'error', message: 'boom' } as unknown as RumEvent);
    reporter.flush();
    expect(sent).toEqual([]);
  });

  it('AC-015-26: a long queue is sent as several reports of at most 20 events', () => {
    const { env, reports } = fakeEnv();
    const reporter = new Reporter(env);
    for (let index = 0; index < RUM.maxEvents + 3; index += 1) reporter.add(timing(index));
    reporter.flush();
    expect(reports().map((report) => report.events.length)).toEqual([RUM.maxEvents, 3]);
  });

  it('AC-015-26: a full queue drops the newest event', () => {
    const { env, reports } = fakeEnv();
    const reporter = new Reporter(env);
    for (let index = 0; index < QUEUE_LIMIT + 10; index += 1) reporter.add(timing(index));
    reporter.flush();
    const durations = reports().flatMap((report) =>
      report.events.map((event) => (event.type === 'timing' ? event.durationMs : -1)),
    );
    expect(durations).toEqual(Array.from({ length: QUEUE_LIMIT }, (_, index) => index));
  });

  it('AC-015-27: a timing event is sent about two seconds later, once for a burst', () => {
    const { env, sent, reports, advance } = fakeEnv();
    const reporter = new Reporter(env);
    reporter.add(timing(1));
    reporter.flushSoon();
    advance(SEND_DELAY_MS - 500);
    reporter.add(timing(2));
    reporter.flushSoon();
    advance(SEND_DELAY_MS - 1);
    expect(sent).toEqual([]);
    advance(1);
    expect(reports()).toEqual([{ events: [timing(1), timing(2)] }]);
    advance(60_000);
    expect(sent).toHaveLength(1);
  });

  it('AC-015-26: the reporter stays well under 30 reports a minute', () => {
    expect(REPORTS_PER_MINUTE).toBeLessThanOrEqual(RUM.reportsPerMinute / 2);
    const { env, sent, advance } = fakeEnv();
    const reporter = new Reporter(env);
    for (let index = 0; index < REPORTS_PER_MINUTE + 5; index += 1) {
      reporter.add(error);
      reporter.flush();
      advance(1_000);
    }
    expect(sent).toHaveLength(REPORTS_PER_MINUTE);
    // What was held back goes out once the minute has passed.
    advance(60_000);
    reporter.flush();
    expect(sent).toHaveLength(REPORTS_PER_MINUTE + 1);
    expect(rumReportSchema.parse(JSON.parse(sent.at(-1)!)).events).toHaveLength(5);
  });

  it('AC-015-27: discarding empties the queue and cancels the pending send', () => {
    const { env, sent, advance, pendingTimers } = fakeEnv();
    const reporter = new Reporter(env);
    reporter.add(timing(1));
    reporter.flushSoon();
    reporter.discard();
    expect(pendingTimers()).toBe(0);
    advance(60_000);
    reporter.flush();
    expect(sent).toEqual([]);
  });
});
