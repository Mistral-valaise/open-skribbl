import { describe, expect, it } from 'vitest';
import { buildMask, hiddenPositions, hintCount, hintTimeMs, letterCounts } from './mask.js';
import { isCloseGuess, isCorrectGuess, levenshtein } from './normalize.js';
import { parseCustomWords, pickChoices } from './select.js';
import { seededRandom } from '../testing/harness.js';

describe('matching (spec 004)', () => {
  it('AC-004-03: tolerant forms of "Tür" are correct', () => {
    for (const guess of ['tür', 'TUR', ' tuer ', 'Tü-r']) {
      expect(isCorrectGuess(guess, 'Tür'), guess).toBe(true);
    }
    expect(isCorrectGuess('tor', 'Tür')).toBe(false);
  });

  it('AC-004-04: spacing, hyphens, accents and ß are tolerated', () => {
    expect(isCorrectGuess('icecream', 'ice cream')).toBe(true);
    expect(isCorrectGuess('Ice-Cream', 'ice cream')).toBe(true);
    expect(isCorrectGuess('nino', 'niño')).toBe(true);
    expect(isCorrectGuess('NIÑO', 'niño')).toBe(true);
    expect(isCorrectGuess('strasse', 'Straße')).toBe(true);
  });

  it('AC-004-05: distance 1 is close for a five-letter word, distance 2 is not', () => {
    expect(isCloseGuess('horse', 'house')).toBe(true);
    expect(isCloseGuess('hose', 'house')).toBe(true);
    expect(isCloseGuess('mouse', 'house')).toBe(true);
    expect(isCloseGuess('home', 'house')).toBe(false);
    expect(isCloseGuess('house', 'house')).toBe(false);
  });

  it('AC-004-06: no guess is close for a three-letter word', () => {
    for (const guess of ['cat', 'cot', 'ca', 'cart', 'dog']) {
      expect(isCloseGuess(guess, 'cat'), guess).toBe(false);
    }
  });

  it('AC-004-07: for a ten-letter word distance 2 is close and distance 3 is not', () => {
    expect(levenshtein('lighthouse', 'lighthoxxe')).toBe(2);
    expect(isCloseGuess('lighthoxxe', 'lighthouse')).toBe(true);
    expect(levenshtein('lighthouse', 'lighthxxxe')).toBe(3);
    expect(isCloseGuess('lighthxxxe', 'lighthouse')).toBe(false);
  });

  it('punctuation-only guesses match nothing', () => {
    expect(isCorrectGuess('!!!', 'cat')).toBe(false);
  });
});

describe('mask and hints (spec 006)', () => {
  it('AC-006-13: the mask of "ice cream" is ___ _____ with letter counts 3 and 5', () => {
    expect(buildMask('ice cream')).toBe('___ _____');
    expect(letterCounts(buildMask('ice cream'))).toEqual([3, 5]);
  });

  it('AC-006-14: the mask of "T-Shirt" shows the hyphen and hides six positions', () => {
    expect(buildMask('T-Shirt')).toBe('_-_____');
    expect(hiddenPositions('T-Shirt')).toHaveLength(6);
  });

  it('AC-006-16: a three-letter word gets one hint, a two-letter word none', () => {
    expect(hintCount('cat', 5)).toBe(1);
    expect(hintCount('ox', 5)).toBe(0);
    expect(hintCount('lighthouse', 2)).toBe(2);
    expect(hintCount('lighthouse', 0)).toBe(0);
  });

  it('hint times split the drawing time evenly', () => {
    expect(hintTimeMs(1, 2, 80_000)).toBeCloseTo(26_666.67, 1);
    expect(hintTimeMs(2, 2, 80_000)).toBeCloseTo(53_333.33, 1);
  });

  it('AC-006-18: a revealed position shows the original character', () => {
    expect(buildMask('Tür', [0, 1])).toBe('Tü_');
  });
});

describe('word selection (spec 006)', () => {
  const builtin = ['apple', 'banana', 'cherry', 'dolphin'];

  it('offers distinct words and prefers unused ones', () => {
    const choices = pickChoices({
      builtin,
      custom: [],
      customOnly: false,
      used: new Set(['apple', 'banana']),
      count: 2,
      random: seededRandom(3),
    });
    expect(new Set(choices)).toEqual(new Set(['cherry', 'dolphin']));
  });

  it('makes used words available again when the pool is exhausted', () => {
    const choices = pickChoices({
      builtin,
      custom: [],
      customOnly: false,
      used: new Set(builtin),
      count: 3,
      random: seededRandom(3),
    });
    expect(new Set(choices).size).toBe(3);
  });

  it('AC-006-08: with customOnly every choice is a custom word', () => {
    const custom = ['one', 'two', 'three', 'four'];
    const choices = pickChoices({
      builtin,
      custom,
      customOnly: true,
      used: new Set(),
      count: 3,
      random: seededRandom(5),
    });
    expect(choices.every((word) => custom.includes(word))).toBe(true);
  });

  it('AC-006-10: custom words are trimmed and merged after normalisation', () => {
    const result = parseCustomWords('Cat, dog\n cat ,  Müller-Lüdenscheidt');
    expect(result).toEqual({ ok: true, words: ['Cat', 'dog', 'Müller-Lüdenscheidt'] });
  });

  it('rejects invalid custom words and names them', () => {
    expect(parseCustomWords('fine, <bad>')).toEqual({
      ok: false,
      invalid: ['<bad>'],
      tooMany: false,
    });
  });
});
