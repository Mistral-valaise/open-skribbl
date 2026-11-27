import { isValidWord, LANGUAGES, wordKey } from '@kritzel/shared';
import { describe, expect, it } from 'vitest';
import { loadWordLists, parseWordList, WORD_TIERS } from './index.js';

describe('word lists (spec 006)', () => {
  const lists = loadWordLists();

  it('parses one word per line and skips comments and blank lines', () => {
    expect(parseWordList('# header\napple\n\n  ice cream  \n# note\nTür\n')).toEqual([
      'apple',
      'ice cream',
      'Tür',
    ]);
  });

  it.each(LANGUAGES)(
    'AC-006-05: the %s lists are valid, large enough and free of duplicates',
    (language) => {
      const seen = new Map<string, string>();
      for (const tier of WORD_TIERS) {
        const words = lists.get(language, tier);
        expect(words.length, `${language}/${tier}`).toBeGreaterThanOrEqual(200);
        for (const word of words) {
          expect(isValidWord(word), `${language}/${tier}: "${word}"`).toBe(true);
          expect(word, `${language}/${tier}: "${word}" is not NFC`).toBe(word.normalize('NFC'));
          const key = wordKey(word);
          expect(
            seen.get(key),
            `"${word}" duplicates "${seen.get(key)}" in ${language}`,
          ).toBeUndefined();
          seen.set(key, `${tier}: ${word}`);
        }
      }
    },
  );

  it('AC-006-07: mixed is the union of the three lists of a language', () => {
    const union = WORD_TIERS.flatMap((tier) => lists.get('de', tier));
    expect(lists.get('de', 'mixed')).toEqual(union);
    expect(lists.get('de', 'easy')).toContain('Tür');
    expect(lists.get('es', 'easy')).toContain('pingüino');
    expect(lists.get('fr', 'easy')).toContain('cœur');
  });
});
