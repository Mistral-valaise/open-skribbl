import { describe, expect, it } from 'vitest';
import { offsetFrom, remainingMs, secondsLeft } from './clock.js';

describe('clock', () => {
  it.each([
    ['30 s behind', -30_000],
    ['30 s ahead', 30_000],
  ])(
    'AC-002-16: a client clock %s still shows the server’s remaining time within 1 s',
    (_label, skew) => {
      const serverNow = 1_700_000_000_000;
      const phaseEndsAt = serverNow + 80_000;
      const localAtSnapshot = serverNow + skew;
      const offset = offsetFrom(serverNow, localAtSnapshot);

      // 12.4 s later on both clocks the server has 67.6 s left.
      const elapsed = 12_400;
      const shown = remainingMs(phaseEndsAt, offset, localAtSnapshot + elapsed);
      const serverRemaining = phaseEndsAt - (serverNow + elapsed);

      expect(Math.abs(shown - serverRemaining)).toBeLessThan(1000);
      expect(secondsLeft(shown)).toBe(68);
    },
  );

  it('AC-002-16: the countdown stops at zero after the deadline', () => {
    const offset = offsetFrom(5_000, 35_000);
    expect(remainingMs(6_000, offset, 40_000)).toBe(0);
  });

  it('has nothing to count down without a deadline', () => {
    expect(remainingMs(null, 0, 1_000)).toBe(0);
  });

  it('shows whole seconds rounded up', () => {
    expect(secondsLeft(80_000)).toBe(80);
    expect(secondsLeft(79_001)).toBe(80);
    expect(secondsLeft(1)).toBe(1);
    expect(secondsLeft(0)).toBe(0);
  });
});
