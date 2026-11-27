import { rumReportSchema } from '@kritzel/shared';
import { describe, expect, it } from 'vitest';
import {
  observeVitals,
  slowestInteraction,
  sumLayoutShifts,
  type PerformanceObserverLike,
  type VitalEntry,
} from './vitals.js';

/** A stand-in for `PerformanceObserver` that supports the given entry types only. */
function fakeObservers(supported: readonly string[]) {
  const live = new Map<string, (entries: VitalEntry[]) => void>();
  const options: Record<string, unknown>[] = [];
  class FakeObserver implements PerformanceObserverLike {
    static supportedEntryTypes = supported;
    private type: string | null = null;
    constructor(private readonly callback: (list: { getEntries(): VitalEntry[] }) => void) {}
    observe(init: { type: string }): void {
      if (!supported.includes(init.type)) throw new TypeError(`unsupported: ${init.type}`);
      options.push(init);
      this.type = init.type;
      live.set(init.type, (entries) => this.callback({ getEntries: () => entries }));
    }
    disconnect(): void {
      if (this.type) live.delete(this.type);
    }
  }
  return {
    Observer: FakeObserver,
    options,
    types: () => [...live.keys()].sort(),
    emit: (type: string, ...entries: VitalEntry[]) => live.get(type)?.(entries),
  };
}

describe('layout shifts', () => {
  it('AC-015-25: the score is the sum of the shifts without recent input', () => {
    const first = sumLayoutShifts(0, [{ value: 0.05 }, { value: 0.5, hadRecentInput: true }]);
    expect(first).toBeCloseTo(0.05);
    expect(sumLayoutShifts(first, [{ value: 0.02, hadRecentInput: false }])).toBeCloseTo(0.07);
    expect(sumLayoutShifts(0.07, [])).toBeCloseTo(0.07);
  });
});

describe('interactions', () => {
  it('AC-015-25: the slowest entry that belongs to an interaction counts', () => {
    expect(slowestInteraction(null, [])).toBeNull();
    // Entries without an interaction id (a mouse move, say) are no interaction.
    expect(slowestInteraction(null, [{ duration: 900 }, { duration: 700, interactionId: 0 }])).toBe(
      null,
    );
    const slowest = slowestInteraction(null, [
      { duration: 48, interactionId: 11 },
      { duration: 120, interactionId: 12 },
      { duration: 64, interactionId: 12 },
    ]);
    expect(slowest).toBe(120);
    expect(slowestInteraction(slowest, [{ duration: 80, interactionId: 13 }])).toBe(120);
    expect(slowestInteraction(slowest, [{ duration: 200, interactionId: 14 }])).toBe(200);
  });
});

describe('observing the page', () => {
  it('AC-015-25: paint, shifts and interactions become events the server accepts', () => {
    const page = fakeObservers(['largest-contentful-paint', 'layout-shift', 'event']);
    const vitals = observeVitals(page.Observer);
    expect(page.types()).toEqual(['event', 'largest-contentful-paint', 'layout-shift']);
    // Entries from before the switch was turned on are read as well.
    expect(page.options.every((init) => init.buffered === true)).toBe(true);

    page.emit('largest-contentful-paint', { startTime: 512.4 }, { startTime: 1180.6 });
    page.emit('layout-shift', { value: 0.031 }, { value: 0.2, hadRecentInput: true });
    page.emit('layout-shift', { value: 0.012 });
    page.emit('event', { duration: 56, interactionId: 7 }, { duration: 400 });
    page.emit('event', { duration: 136, interactionId: 8 });

    const events = vitals.take();
    expect(events).toEqual([
      { type: 'web_vital', name: 'lcp', value: 1181 },
      { type: 'web_vital', name: 'inp', value: 136 },
      { type: 'layout_shift', value: 0.043 },
    ]);
    expect(rumReportSchema.safeParse({ events }).success).toBe(true);
  });

  it('AC-015-25: a page without shifts reports a layout shift of zero', () => {
    const page = fakeObservers(['layout-shift']);
    expect(observeVitals(page.Observer).take()).toEqual([{ type: 'layout_shift', value: 0 }]);
  });

  it('AC-015-25: a browser that supports less reports less', () => {
    const partial = fakeObservers(['largest-contentful-paint']);
    const vitals = observeVitals(partial.Observer);
    expect(partial.types()).toEqual(['largest-contentful-paint']);
    // No paint was seen and nothing else can be measured.
    expect(vitals.take()).toEqual([]);

    expect(observeVitals(undefined).take()).toEqual([]);
    expect(observeVitals(fakeObservers([]).Observer).take()).toEqual([]);
  });

  it('AC-015-27: after stopping, no observer is left', () => {
    const page = fakeObservers(['largest-contentful-paint', 'layout-shift', 'event']);
    const vitals = observeVitals(page.Observer);
    vitals.stop();
    expect(page.types()).toEqual([]);
  });
});
