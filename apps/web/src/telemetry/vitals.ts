import type { RumEvent } from '@kritzel/shared';

/**
 * Largest Contentful Paint, Cumulative Layout Shift and Interaction to Next
 * Paint, read from `PerformanceObserver` (spec 015, "Browser measurements").
 * Hand-written and deliberately simple: the layout shift score is the plain
 * sum of the page view, and the interaction time is its slowest interaction.
 * A browser that lacks an entry type reports that much less.
 */

/** The fields of the performance entries that are read; each type has its own. */
export interface VitalEntry {
  /** `largest-contentful-paint`: when the element was painted, in milliseconds. */
  startTime?: number;
  /** `layout-shift`: the score of one shift. */
  value?: number;
  /** `layout-shift`: the shift followed an input and does not count. */
  hadRecentInput?: boolean;
  /** `event`: from the input to the next paint, in milliseconds. */
  duration?: number;
  /** `event`: set (non-zero) when the event belongs to an interaction. */
  interactionId?: number;
}

/** The part of a `PerformanceObserver` that is used. */
export interface PerformanceObserverLike {
  observe(options: { type: string; buffered?: boolean; durationThreshold?: number }): void;
  disconnect(): void;
}

/** The part of the `PerformanceObserver` constructor that is used. */
export interface PerformanceObserverConstructor {
  new (callback: (list: { getEntries(): VitalEntry[] }) => void): PerformanceObserverLike;
  readonly supportedEntryTypes?: readonly string[];
}

/** Events faster than this are not delivered; interactions below it are not slow. */
const INTERACTION_THRESHOLD_MS = 40;

/** Adds the shifts that did not follow an input to the running score. */
export function sumLayoutShifts(total: number, entries: readonly VitalEntry[]): number {
  return entries.reduce(
    (sum, entry) => (entry.hadRecentInput ? sum : sum + (entry.value ?? 0)),
    total,
  );
}

/** The longest duration among the events that belong to an interaction; null when there is none. */
export function slowestInteraction(
  slowest: number | null,
  entries: readonly VitalEntry[],
): number | null {
  return entries.reduce<number | null>(
    (longest, entry) =>
      entry.interactionId && entry.duration !== undefined
        ? Math.max(longest ?? 0, entry.duration)
        : longest,
    slowest,
  );
}

export interface Vitals {
  /** What was measured so far, as report events. */
  take(): RumEvent[];
  /** Disconnects every observer. */
  stop(): void;
}

/** Starts observing; entries from before the call are included where the browser kept them. */
export function observeVitals(Observer: PerformanceObserverConstructor | undefined): Vitals {
  const supported = Observer?.supportedEntryTypes ?? [];
  const observers: PerformanceObserverLike[] = [];
  const watch = (
    type: string,
    onEntries: (entries: VitalEntry[]) => void,
    options: { durationThreshold?: number } = {},
  ): boolean => {
    if (!Observer || !supported.includes(type)) return false;
    try {
      const observer = new Observer((list) => onEntries(list.getEntries()));
      observer.observe({ type, buffered: true, ...options });
      observers.push(observer);
      return true;
    } catch {
      return false;
    }
  };

  let paint: number | null = null;
  let shifts = 0;
  let interaction: number | null = null;
  // The last entry is the largest paint so far.
  watch('largest-contentful-paint', (entries) => {
    paint = entries.at(-1)?.startTime ?? paint;
  });
  const shiftsObserved = watch('layout-shift', (entries) => {
    shifts = sumLayoutShifts(shifts, entries);
  });
  watch(
    'event',
    (entries) => {
      interaction = slowestInteraction(interaction, entries);
    },
    { durationThreshold: INTERACTION_THRESHOLD_MS },
  );

  return {
    take() {
      const events: RumEvent[] = [];
      if (paint !== null) events.push({ type: 'web_vital', name: 'lcp', value: Math.round(paint) });
      if (interaction !== null) {
        events.push({ type: 'web_vital', name: 'inp', value: Math.round(interaction) });
      }
      // A page without a single shift is a measurement too: a score of zero.
      if (shiftsObserved) {
        events.push({ type: 'layout_shift', value: Math.round(shifts * 10_000) / 10_000 });
      }
      return events;
    },
    stop() {
      for (const observer of observers.splice(0)) observer.disconnect();
    },
  };
}
