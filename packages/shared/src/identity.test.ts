import { describe, expect, it } from 'vitest';
import { cleanNickname, isValidAvatar, uniqueNickname } from './identity.js';

describe('identity (spec 010)', () => {
  it('AC-010-01: nicknames are trimmed and inner whitespace collapsed', () => {
    expect(cleanNickname('  Mara  ')).toBe('Mara');
    expect(cleanNickname('Mara   K')).toBe('Mara K');
    expect(cleanNickname('José_99')).toBe('José_99');
  });

  it('AC-010-02: empty, too long and markup nicknames are invalid', () => {
    expect(cleanNickname('   ')).toBeNull();
    expect(cleanNickname('a'.repeat(17))).toBeNull();
    expect(cleanNickname('<Mara>')).toBeNull();
    expect(cleanNickname('a'.repeat(16))).toBe('a'.repeat(16));
  });

  it('AC-010-03: a taken nickname gets the lowest free number, case-insensitively', () => {
    expect(uniqueNickname('mara', ['Mara'])).toBe('mara 2');
    expect(uniqueNickname('MARA', ['Mara', 'mara 2'])).toBe('MARA 3');
    expect(uniqueNickname('Noa', ['Mara'])).toBe('Noa');
  });

  it('AC-010-04: avatar indices must be integers within range', () => {
    expect(isValidAvatar({ body: 11, eyes: 7, mouth: 7, accessory: 0 })).toBe(true);
    expect(isValidAvatar({ body: 0, eyes: 8, mouth: 0, accessory: 0 })).toBe(false);
    expect(isValidAvatar({ body: 0.5, eyes: 0, mouth: 0, accessory: 0 })).toBe(false);
    expect(isValidAvatar({ body: 0, eyes: 0, mouth: 0 })).toBe(false);
  });
});
