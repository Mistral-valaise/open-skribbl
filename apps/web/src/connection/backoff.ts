/** Client reconnect backoff (spec 007): 0.5 s, 1 s, 2 s, 4 s, then every 5 s. */
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000] as const;
const RECONNECT_STEADY_MS = 5000;

/** Delay before reconnect attempt number `attempt` (0 for the first retry). */
export function reconnectDelay(attempt: number): number {
  return RECONNECT_DELAYS_MS[attempt] ?? RECONNECT_STEADY_MS;
}
