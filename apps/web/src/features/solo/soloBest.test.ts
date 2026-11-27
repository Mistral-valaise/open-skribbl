import { describe, expect, it } from 'vitest';
import {
  loadBests,
  parseBests,
  RECENT_RUNS,
  recordRun,
  saveBests,
  SOLO_BEST_STORAGE_KEY,
  type SoloBests,
} from './soloBest.js';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

const day = (n: number) => `2026-11-${String(n).padStart(2, '0')}T12:00:00.000Z`;

describe('solo personal best', () => {
  it('AC-009-12: a higher total replaces the stored best of the run’s language', () => {
    const first = recordRun({}, 'de', 1200, day(1));
    expect(first.isNewBest).toBe(true);
    expect(first.bests.de?.best).toBe(1200);
    const lower = recordRun(first.bests, 'de', 900, day(2));
    expect(lower.isNewBest).toBe(false);
    expect(lower.bests.de?.best).toBe(1200);
    const equal = recordRun(lower.bests, 'de', 1200, day(3));
    expect(equal.isNewBest).toBe(false);
    const higher = recordRun(equal.bests, 'de', 1500, day(4));
    expect(higher.isNewBest).toBe(true);
    expect(higher.bests.de?.best).toBe(1500);
  });

  it('AC-009-12: the bests of other languages are unaffected', () => {
    let bests: SoloBests = recordRun({}, 'de', 1200, day(1)).bests;
    bests = recordRun(bests, 'es', 400, day(2)).bests;
    bests = recordRun(bests, 'de', 2000, day(3)).bests;
    expect(bests.es).toEqual({ best: 400, recent: [{ total: 400, date: day(2) }] });
    expect(bests.de?.best).toBe(2000);
    expect(bests.en).toBeUndefined();
    expect(bests.fr).toBeUndefined();
  });

  it('AC-009-12: the five most recent totals are kept with their dates, latest first', () => {
    let bests: SoloBests = {};
    for (let run = 1; run <= 7; run += 1) bests = recordRun(bests, 'fr', run * 100, day(run)).bests;
    expect(bests.fr?.recent).toHaveLength(RECENT_RUNS);
    expect(bests.fr?.recent.map((entry) => entry.total)).toEqual([700, 600, 500, 400, 300]);
    expect(bests.fr?.recent[0]?.date).toBe(day(7));
    expect(bests.fr?.best).toBe(700);
  });

  it('AC-009-12: the values survive a reload through storage', () => {
    const storage = memoryStorage();
    expect(loadBests(storage)).toEqual({});
    const { bests } = recordRun(recordRun({}, 'de', 1200, day(1)).bests, 'en', 800, day(2));
    saveBests(storage, bests);
    expect(storage.values.has(SOLO_BEST_STORAGE_KEY)).toBe(true);
    // A reload: nothing but the storage is left.
    expect(loadBests(storage)).toEqual(bests);
  });

  it('a run without points is recorded but is not a new best', () => {
    const { bests, isNewBest } = recordRun({}, 'en', 0, day(1));
    expect(isNewBest).toBe(false);
    expect(bests.en).toEqual({ best: 0, recent: [{ total: 0, date: day(1) }] });
  });

  it('ignores stored data that does not have the expected shape', () => {
    expect(parseBests(null)).toEqual({});
    expect(parseBests('not json')).toEqual({});
    expect(parseBests('[1, 2]')).toEqual({});
    expect(
      parseBests(
        JSON.stringify({
          de: { best: 500, recent: [{ total: 500, date: day(1) }, { total: 'x' }, null] },
          es: { best: -5, recent: [] },
          xx: { best: 9999, recent: [] },
          fr: 'nonsense',
        }),
      ),
    ).toEqual({ de: { best: 500, recent: [{ total: 500, date: day(1) }] } });
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadBests(blocked)).toEqual({});
    expect(() => saveBests(blocked, {})).not.toThrow();
  });
});
