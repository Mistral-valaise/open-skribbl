import { RECONNECT } from '@kritzel/shared';

/** Client reconnect backoff (spec 007): 0.5 s, 1 s, 2 s, 4 s, then every 5 s. */

/** Delay before reconnect attempt number `attempt` (0 for the first retry). */
export function reconnectDelay(attempt: number): number {
  return RECONNECT.delaysMs[attempt] ?? RECONNECT.steadyMs;
}
