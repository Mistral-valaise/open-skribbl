/**
 * Countdown arithmetic (spec 002, "Snapshot contents"). Snapshots carry the
 * server's clock and absolute deadlines; the client measures how far its own
 * clock is off and renders countdowns locally.
 */

/** Milliseconds to add to the local clock to get the server's clock. */
export function offsetFrom(serverNow: number, localNow: number): number {
  return serverNow - localNow;
}

/** Time left until a server deadline, never negative; 0 when there is no deadline. */
export function remainingMs(phaseEndsAt: number | null, offset: number, localNow: number): number {
  if (phaseEndsAt === null) return 0;
  return Math.max(0, phaseEndsAt - (localNow + offset));
}

/** Whole seconds shown on the timer: 80 for a full 80 s, 1 during the last second, then 0. */
export function secondsLeft(remaining: number): number {
  return Math.ceil(remaining / 1000);
}
