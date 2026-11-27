import { describe, expect, it } from 'vitest';
import { createTraceparent } from './traceparent.js';

const PATTERN = /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/;

describe('traceparent', () => {
  it('AC-015-28: a traceparent has the W3C form with a sampled flag', () => {
    expect(createTraceparent()).toMatch(PATTERN);
  });

  it('AC-015-28: the ids are written as lower-case hex with leading zeros', () => {
    const value = createTraceparent((bytes) => bytes.forEach((_, index) => (bytes[index] = index)));
    expect(value).toBe('00-000102030405060708090a0b0c0d0e0f-0001020304050607-01');
  });

  it('AC-015-28: every call produces fresh ids', () => {
    const values = new Set(Array.from({ length: 50 }, () => createTraceparent()));
    expect(values.size).toBe(50);
  });

  it('AC-015-28: an id is never all zeros, which the server would ignore', () => {
    const value = createTraceparent((bytes) => bytes.fill(0));
    expect(value).toMatch(PATTERN);
    const [, traceId, spanId] = value.split('-');
    expect(traceId).not.toMatch(/^0+$/);
    expect(spanId).not.toMatch(/^0+$/);
  });
});
