/** Time and timers, injectable so tests can drive rooms without waiting. */
export interface Clock {
  now(): number;
  /** Calls `fn` once at time `at`; returns a function that cancels it. */
  setTimer(at: number, fn: () => void): () => void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimer(at, fn) {
    const handle = setTimeout(fn, Math.max(0, at - Date.now()));
    return () => clearTimeout(handle);
  },
};
