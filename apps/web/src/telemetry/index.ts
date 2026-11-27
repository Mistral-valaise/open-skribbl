import { create } from 'zustand';
import { fetchClientConfig, postMeasurements } from '../connection/api.js';
import type { AttemptTiming } from '../connection/roomConnection.js';
import { readChoice, writeChoice, type ChoiceStorage } from './choice.js';
import { startMeasuring, type Measuring } from './measuring.js';
import type { PerformanceObserverConstructor } from './vitals.js';

/**
 * Browser measurements (spec 015): offered only when the server says so, off
 * until the player switches them on, and measured only while both hold.
 * Everything is sent to the app's own origin; there is no cookie and no
 * identifier.
 */

function browserStorage(): ChoiceStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface MeasurementsState {
  /** The operator offers browser measurements (`GET /api/config`). */
  offered: boolean;
  /** The player's choice; it has an effect only while they are offered. */
  on: boolean;
}

export const useMeasurementsStore = create<MeasurementsState>(() => ({
  offered: false,
  on: typeof window === 'undefined' ? false : readChoice(browserStorage()),
}));

/** One per page load: the vitals of a page view are reported once. */
const pageView = { vitalsReported: false };
let measuring: Measuring | null = null;

/** Measures exactly while browser measurements are offered and switched on. */
function applyState(): void {
  const { offered, on } = useMeasurementsStore.getState();
  if (offered && on) {
    measuring ??= startMeasuring({
      window,
      document,
      // Absent in old browsers; the vitals are then not reported.
      PerformanceObserver: (globalThis as { PerformanceObserver?: PerformanceObserverConstructor })
        .PerformanceObserver,
      pageView,
      send: postMeasurements,
      now: () => performance.now(),
      setTimer: (run, ms) => window.setTimeout(run, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
    });
  } else {
    measuring?.stop();
    measuring = null;
  }
}

/** Asks the server once, at start-up, whether browser measurements are offered. */
export async function loadMeasurementsOffer(): Promise<void> {
  const { rum } = await fetchClientConfig();
  useMeasurementsStore.setState({ offered: rum });
  applyState();
}

/** The player's switch: remembered, and effective at once in both directions. */
export function setMeasurementsOn(on: boolean): void {
  useMeasurementsStore.setState({ on });
  writeChoice(browserStorage(), on);
  applyState();
}

/** Times a join or reconnect attempt; null while browser measurements are not running. */
export function measureAttempt(name: 'join' | 'reconnect'): AttemptTiming | null {
  return measuring?.timing(name) ?? null;
}
