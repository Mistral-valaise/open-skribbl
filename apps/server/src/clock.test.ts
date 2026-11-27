import { describe, expect, it } from 'vitest';
import { createSystemClock } from './clock.js';

/** A wall clock and a scheduler the test moves by hand. */
function fakeTime(start: number) {
  let now = start;
  const scheduled: { delay: number; fn: () => void; cancelled: boolean }[] = [];
  return {
    scheduled,
    set: (value: number) => (now = value),
    clock: createSystemClock(
      () => now,
      (fn, delay) => {
        const entry = { delay, fn, cancelled: false };
        scheduled.push(entry);
        return () => (entry.cancelled = true);
      },
    ),
  };
}

describe('system clock', () => {
  it('AC-002-09: a timer that the runtime fires a moment early waits for its time instead of being lost', () => {
    const time = fakeTime(1_000);
    let calls = 0;
    time.clock.setTimer(7_000, () => (calls += 1));
    expect(time.scheduled.map((entry) => entry.delay)).toEqual([6_000]);

    // The runtime's timers and the wall clock disagree by a millisecond.
    time.set(6_999);
    time.scheduled[0]!.fn();
    expect(calls).toBe(0);
    expect(time.scheduled.map((entry) => entry.delay)).toEqual([6_000, 1]);

    time.set(7_000);
    time.scheduled[1]!.fn();
    expect(calls).toBe(1);
    expect(time.scheduled).toHaveLength(2);
  });

  it('cancelling stops the timer, including one that was put off', () => {
    const time = fakeTime(1_000);
    let calls = 0;
    const cancel = time.clock.setTimer(2_000, () => (calls += 1));
    time.set(1_999);
    time.scheduled[0]!.fn();
    cancel();
    expect(time.scheduled[1]!.cancelled).toBe(true);
    expect(calls).toBe(0);
  });

  it('a time in the past fires on the next tick', () => {
    const time = fakeTime(5_000);
    let calls = 0;
    time.clock.setTimer(4_000, () => (calls += 1));
    expect(time.scheduled[0]!.delay).toBe(0);
    time.scheduled[0]!.fn();
    expect(calls).toBe(1);
  });
});
