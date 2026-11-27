import { describe, expect, it } from 'vitest';
import { drawerPoints, guessPoints, rank } from './scoring.js';

describe('scoring formulas (spec 005)', () => {
  it('AC-005-01: 60 s remaining of 80 s earns 400 points', () => {
    expect(guessPoints(60_000, 80_000)).toBe(400);
  });

  it('AC-005-02: 0 s remaining earns 100 points, the full time earns 500', () => {
    expect(guessPoints(0, 80_000)).toBe(100);
    expect(guessPoints(80_000, 80_000)).toBe(500);
    expect(guessPoints(-5, 80_000)).toBe(100);
    expect(guessPoints(90_000, 80_000)).toBe(500);
  });

  it('AC-005-04: guesses of 450 and 300 among three guessers earn the drawer 250', () => {
    expect(drawerPoints([450, 300], 3)).toBe(250);
  });

  it('AC-005-05: no guesses earn the drawer 0', () => {
    expect(drawerPoints([], 3)).toBe(0);
  });

  it('AC-005-09: scores 900, 700, 700, 300 rank 1, 2, 2, 4 with ties in join order', () => {
    const ranked = rank([
      { id: 'late', score: 700, joinedSeq: 3 },
      { id: 'low', score: 300, joinedSeq: 0 },
      { id: 'early', score: 700, joinedSeq: 1 },
      { id: 'top', score: 900, joinedSeq: 2 },
    ]);
    expect(ranked.map((entry) => [entry.id, entry.rank])).toEqual([
      ['top', 1],
      ['early', 2],
      ['late', 2],
      ['low', 4],
    ]);
  });
});
