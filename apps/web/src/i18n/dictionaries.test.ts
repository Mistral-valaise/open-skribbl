import { LANGUAGES } from '@kritzel/shared';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from './dictionaries.js';

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('dictionaries', () => {
  const englishKeys = Object.keys(DICTIONARIES.en).sort();

  it('AC-006-03: the de, es and fr dictionaries have exactly the keys of en', () => {
    expect(Object.keys(DICTIONARIES).sort()).toEqual([...LANGUAGES].sort());
    for (const language of ['de', 'es', 'fr'] as const) {
      expect(Object.keys(DICTIONARIES[language]).sort(), language).toEqual(englishKeys);
    }
  });

  it('AC-006-03: every translation uses the placeholders of the English text', () => {
    for (const language of ['de', 'es', 'fr'] as const) {
      for (const key of englishKeys as (keyof typeof DICTIONARIES.en)[]) {
        expect(placeholders(DICTIONARIES[language][key]), `${language} ${key}`).toEqual(
          placeholders(DICTIONARIES.en[key]),
        );
      }
    }
  });

  it('never translates the name of the game', () => {
    for (const language of LANGUAGES) expect(DICTIONARIES[language]['app.name']).toBe('Kritzel');
  });

  it('has no empty text', () => {
    for (const language of LANGUAGES) {
      for (const text of Object.values(DICTIONARIES[language])) expect(text.trim()).not.toBe('');
    }
  });
});
