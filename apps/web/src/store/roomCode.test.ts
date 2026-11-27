import { describe, expect, it } from 'vitest';
import { isRoomCodeShaped, normalizeRoomCode } from './roomCode.js';

describe('room code input', () => {
  it('AC-001-03: a lower-case code with surrounding spaces becomes the exact code', () => {
    expect(normalizeRoomCode('  abc234 ')).toBe('ABC234');
  });

  it('accepts six characters of the room code alphabet only', () => {
    expect(isRoomCodeShaped('ABC234')).toBe(true);
    expect(isRoomCodeShaped('ABC23')).toBe(false);
    expect(isRoomCodeShaped('ABC2345')).toBe(false);
    expect(isRoomCodeShaped('ABCO10')).toBe(false);
  });
});
