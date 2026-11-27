/** Time and timers, injectable so tests can drive rooms without waiting. */
export interface Clock {
  now(): number;
  /** Calls `fn` once at time `at`, never before; returns a function that cancels it. */
  setTimer(at: number, fn: () => void): () => void;
}

type Schedule = (fn: () => void, delayMs: number) => () => void;

const scheduleTimeout: Schedule = (fn, delayMs) => {
  const handle = setTimeout(fn, delayMs);
  return () => clearTimeout(handle);
};

/**
 * A clock over a wall time and a scheduler. The runtime's timers run on a
 * different clock than `Date.now()` and can fire a millisecond early; the
 * rules ignore a timer that arrives before its time, so an early one is put
 * off until the wall clock has caught up instead of being delivered and lost.
 */
export function createSystemClock(
  now: () => number = () => Date.now(),
  schedule: Schedule = scheduleTimeout,
): Clock {
  return {
    now,
    setTimer(at, fn) {
      let cancel: () => void = () => undefined;
      const arm = () => {
        cancel = schedule(
          () => {
            if (now() < at) arm();
            else fn();
          },
          Math.max(0, at - now()),
        );
      };
      arm();
      return () => cancel();
    },
  };
}

export const systemClock: Clock = createSystemClock();
