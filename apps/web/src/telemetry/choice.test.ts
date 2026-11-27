import { RUM } from '@kritzel/shared';
import { describe, expect, it } from 'vitest';
import { readChoice, writeChoice, type ChoiceStorage } from './choice.js';

function memoryStorage(): ChoiceStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

const blockedStorage: ChoiceStorage = {
  getItem: () => {
    throw new Error('storage blocked');
  },
  setItem: () => {
    throw new Error('storage blocked');
  },
};

describe('the stored choice for browser measurements', () => {
  it('AC-015-27: without a stored choice browser measurements are off', () => {
    expect(readChoice(memoryStorage())).toBe(false);
    expect(readChoice(null)).toBe(false);
  });

  it('AC-015-27: the choice is kept under the spec key and survives a new start', () => {
    const storage = memoryStorage();
    writeChoice(storage, true);
    expect([...storage.values.keys()]).toEqual([RUM.storageKey]);
    expect(readChoice(storage)).toBe(true);
    writeChoice(storage, false);
    expect(readChoice(storage)).toBe(false);
  });

  it('AC-015-27: an unusable stored value or blocked storage means off', () => {
    const storage = memoryStorage();
    for (const value of ['', '1', 'true', 'ON', 'yes']) {
      storage.values.set(RUM.storageKey, value);
      expect(readChoice(storage), value).toBe(false);
    }
    expect(readChoice(blockedStorage)).toBe(false);
    expect(() => writeChoice(blockedStorage, true)).not.toThrow();
  });
});
