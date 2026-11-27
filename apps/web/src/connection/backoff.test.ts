import { describe, expect, it } from 'vitest';
import { reconnectDelay } from './backoff.js';

describe('reconnectDelay', () => {
  it('waits 0.5 s, 1 s, 2 s and 4 s, then 5 s before every further attempt', () => {
    const delays = Array.from({ length: 8 }, (_, attempt) => reconnectDelay(attempt));
    expect(delays).toEqual([500, 1000, 2000, 4000, 5000, 5000, 5000, 5000]);
  });
});
