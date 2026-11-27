import { RUM, rumReportSchema, type RumEvent } from '@kritzel/shared';
import { describe, expect, it } from 'vitest';
import { startMeasuring, type MeasuringEnv } from './measuring.js';
import { SEND_DELAY_MS } from './reporter.js';
import type { PerformanceObserverLike, VitalEntry } from './vitals.js';

/** A stand-in for the page: events, visibility, a clock, timers and performance entries. */
function fakePage() {
  let now = 1_000;
  let nextId = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  const sent: string[] = [];
  const observers = new Map<string, (entries: VitalEntry[]) => void>();
  const listeners = { window: 0, document: 0 };

  const counted = (name: 'window' | 'document') => {
    const target = new EventTarget();
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    target.addEventListener = (...args: Parameters<EventTarget['addEventListener']>) => {
      listeners[name] += 1;
      add(...args);
    };
    target.removeEventListener = (...args: Parameters<EventTarget['removeEventListener']>) => {
      listeners[name] -= 1;
      remove(...args);
    };
    return target;
  };
  const document = Object.assign(counted('document'), { visibilityState: 'visible' });
  const window = counted('window');

  class FakeObserver implements PerformanceObserverLike {
    static supportedEntryTypes = ['largest-contentful-paint', 'layout-shift', 'event'];
    private type: string | null = null;
    constructor(private readonly callback: (list: { getEntries(): VitalEntry[] }) => void) {}
    observe(init: { type: string }): void {
      this.type = init.type;
      observers.set(init.type, (entries) => this.callback({ getEntries: () => entries }));
    }
    disconnect(): void {
      if (this.type) observers.delete(this.type);
    }
  }

  let seed = 0;
  const env: MeasuringEnv = {
    window,
    document,
    PerformanceObserver: FakeObserver,
    pageView: { vitalsReported: false },
    random: (bytes) => {
      seed += 1;
      bytes.fill(seed);
    },
    send: (body) => void sent.push(body),
    now: () => now,
    setTimer: (run, ms) => {
      timers.set(nextId, { at: now + ms, run });
      return nextId++;
    },
    clearTimer: (handle) => void timers.delete(handle as number),
  };

  return {
    env,
    sent,
    listeners,
    observed: () => [...observers.keys()].sort(),
    emit: (type: string, ...entries: VitalEntry[]) => observers.get(type)?.(entries),
    events: (): RumEvent[] =>
      sent.flatMap((body) => rumReportSchema.parse(JSON.parse(body)).events),
    advance: (ms: number) => {
      const until = now + ms;
      for (const [id, timer] of [...timers.entries()].sort(([, a], [, b]) => a.at - b.at)) {
        if (timer.at > until) continue;
        timers.delete(id);
        now = timer.at;
        timer.run();
      }
      now = until;
    },
    hide: () => {
      document.visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    },
    show: () => {
      document.visibilityState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    },
    fail: (kind: 'error' | 'unhandledrejection') => window.dispatchEvent(new Event(kind)),
  };
}

describe('measuring a page view', () => {
  it('AC-015-25: the vitals are reported once, when the page is hidden', () => {
    const page = fakePage();
    startMeasuring(page.env);
    page.emit('largest-contentful-paint', { startTime: 840 });
    page.emit('layout-shift', { value: 0.02 });
    page.emit('event', { duration: 72, interactionId: 3 });
    page.advance(30_000);
    expect(page.sent).toEqual([]);

    page.hide();
    expect(page.events()).toEqual([
      { type: 'web_vital', name: 'lcp', value: 840 },
      { type: 'web_vital', name: 'inp', value: 72 },
      { type: 'layout_shift', value: 0.02 },
    ]);
    expect(page.observed()).toEqual([]);

    // Coming back and leaving again repeats nothing: a report carries no identifier to match by.
    page.show();
    page.hide();
    expect(page.sent).toHaveLength(1);
  });

  it('AC-015-25: a page that becomes visible again sends nothing', () => {
    const page = fakePage();
    startMeasuring(page.env);
    page.show();
    expect(page.sent).toEqual([]);
  });

  it('AC-015-25: `pagehide` sends as well, for browsers that skip `visibilitychange`', () => {
    const page = fakePage();
    startMeasuring(page.env);
    page.env.window.dispatchEvent(new Event('pagehide'));
    expect(page.events()).toEqual([{ type: 'layout_shift', value: 0 }]);
  });

  it('AC-015-25: script errors are counted by kind, without message or stack', () => {
    const page = fakePage();
    startMeasuring(page.env);
    const failure = Object.assign(new Event('error'), {
      message: 'Uncaught TypeError: secret is not a function',
      filename: 'https://kritzel.example/r/ABCDEF',
      error: new Error('secret'),
    });
    page.env.window.dispatchEvent(failure);
    page.fail('unhandledrejection');
    page.hide();
    expect(page.sent).toHaveLength(1);
    expect(page.sent[0]).not.toContain('secret');
    expect(page.sent[0]).not.toContain('ABCDEF');
    expect(page.events().filter((event) => event.type === 'error')).toEqual([
      { type: 'error', kind: 'error' },
      { type: 'error', kind: 'unhandledrejection' },
    ]);
  });

  it('AC-015-26: a storm of script errors is cut off', () => {
    const page = fakePage();
    startMeasuring(page.env);
    for (let index = 0; index < 500; index += 1) page.fail('error');
    page.hide();
    const errors = page.events().filter((event) => event.type === 'error');
    expect(errors.length).toBeLessThanOrEqual(RUM.maxEvents);
    expect(page.sent.length).toBeLessThanOrEqual(2);
  });

  it('AC-015-28: a join is timed from opening the socket to `joined` and carries its traceparent', () => {
    const page = fakePage();
    const measuring = startMeasuring(page.env);
    const attempt = measuring.timing('join');
    expect(attempt.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    page.advance(184);
    attempt.settle('ok');
    // The socket closes much later; the attempt keeps its first outcome.
    attempt.settle('failed');
    expect(page.sent).toEqual([]);
    page.advance(SEND_DELAY_MS);
    expect(page.events()).toEqual([
      {
        type: 'timing',
        name: 'join',
        outcome: 'ok',
        durationMs: 184,
        traceparent: attempt.traceparent,
      },
    ]);
  });

  it('AC-015-28: a failed reconnect is reported as such, and every attempt has fresh ids', () => {
    const page = fakePage();
    const measuring = startMeasuring(page.env);
    const first = measuring.timing('reconnect');
    page.advance(40);
    first.settle('failed');
    const second = measuring.timing('reconnect');
    page.advance(60);
    second.settle('ok');
    expect(second.traceparent).not.toBe(first.traceparent);
    page.advance(SEND_DELAY_MS);
    expect(page.events()).toEqual([
      {
        type: 'timing',
        name: 'reconnect',
        outcome: 'failed',
        durationMs: 40,
        traceparent: first.traceparent,
      },
      {
        type: 'timing',
        name: 'reconnect',
        outcome: 'ok',
        durationMs: 60,
        traceparent: second.traceparent,
      },
    ]);
  });

  it('AC-015-27: after stopping, nothing is observed, queued or sent', () => {
    const page = fakePage();
    const measuring = startMeasuring(page.env);
    expect(page.listeners.window).toBeGreaterThan(0);
    expect(page.listeners.document).toBeGreaterThan(0);
    page.emit('largest-contentful-paint', { startTime: 840 });
    page.fail('error');
    const pending = measuring.timing('join');
    const settled = measuring.timing('join');
    settled.settle('ok');

    measuring.stop();
    expect(page.listeners).toEqual({ window: 0, document: 0 });
    expect(page.observed()).toEqual([]);

    pending.settle('ok');
    page.fail('error');
    page.advance(60_000);
    page.hide();
    page.env.window.dispatchEvent(new Event('pagehide'));
    expect(page.sent).toEqual([]);
  });

  it('AC-015-25: switching on again in the same page view does not report the vitals twice', () => {
    const page = fakePage();
    startMeasuring(page.env).stop();
    const again = startMeasuring(page.env);
    page.emit('largest-contentful-paint', { startTime: 500 });
    page.hide();
    expect(page.events()).toEqual([
      { type: 'web_vital', name: 'lcp', value: 500 },
      { type: 'layout_shift', value: 0 },
    ]);
    again.stop();

    page.show();
    startMeasuring(page.env);
    expect(page.observed()).toEqual([]);
    page.hide();
    expect(page.sent).toHaveLength(1);
  });
});
