import { LANGUAGES } from '@kritzel/shared';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n/dictionaries.js';

const KEYS = [
  'measurements.title',
  'measurements.explanation',
  'measurements.switch',
  'measurements.close',
] as const;

/** What the explanation has to name in each language: what is shared, and what never is. */
const NAMED: Readonly<Record<(typeof LANGUAGES)[number], readonly RegExp[]>> = {
  en: [/optional/i, /loading/i, /error/i, /join/i, /names/i, /chat/i, /drawings/i, /words/i],
  de: [/freiwillig/i, /lade/i, /fehler/i, /beitr/i, /namen/i, /chat/i, /zeichnungen/i, /wörter/i],
  es: [/opcional/i, /carga/i, /errores/i, /unirte/i, /nombres/i, /chat/i, /dibujos/i, /palabras/i],
  fr: [
    /facultatif/i,
    /chargement/i,
    /erreurs/i,
    /rejoindre/i,
    /noms/i,
    /chat/i,
    /dessins/i,
    /mots/i,
  ],
};

describe('copy for browser measurements', () => {
  it('AC-015-30: the switch and its explanation exist in English, German, Spanish and French', () => {
    for (const language of LANGUAGES) {
      for (const key of KEYS) {
        expect(DICTIONARIES[language][key]?.trim(), `${language} ${key}`).toBeTruthy();
      }
    }
    for (const language of ['de', 'es', 'fr'] as const) {
      for (const key of ['measurements.explanation', 'measurements.switch'] as const) {
        expect(DICTIONARIES[language][key], `${language} ${key}`).not.toBe(DICTIONARIES.en[key]);
      }
    }
  });

  it('AC-015-30: the explanation says what is shared and what never is, in every language', () => {
    for (const language of LANGUAGES) {
      const explanation = DICTIONARIES[language]['measurements.explanation'];
      for (const pattern of NAMED[language]) {
        expect(explanation, `${language} ${pattern}`).toMatch(pattern);
      }
    }
  });

  it('AC-015-30: the copy uses the glossary term and none of the words it rules out', () => {
    for (const language of LANGUAGES) {
      for (const key of KEYS) {
        expect(DICTIONARIES[language][key], `${language} ${key}`).not.toMatch(
          /\bRUM\b|track|anal[yi]/i,
        );
      }
    }
  });
});
