import { describe, expect, it } from 'vitest';
import { detectLanguage } from './language.js';

describe('detectLanguage', () => {
  it('AC-006-01: the first browser language with a supported primary subtag is used', () => {
    expect(detectLanguage(['de-AT', 'en'], null)).toBe('de');
    expect(detectLanguage(['fr-CA'], null)).toBe('fr');
    expect(detectLanguage(['it', 'es-MX', 'de'], null)).toBe('es');
    expect(detectLanguage(['EN-us'], null)).toBe('en');
  });

  it('AC-006-01: an unsupported browser language falls back to English', () => {
    expect(detectLanguage(['it'], null)).toBe('en');
    expect(detectLanguage([], null)).toBe('en');
  });

  it('AC-006-01: the stored choice wins over the browser languages', () => {
    expect(detectLanguage(['de-AT', 'en'], 'es')).toBe('es');
    expect(detectLanguage(['it'], 'fr')).toBe('fr');
  });

  it('ignores a stored value that is not a supported language', () => {
    expect(detectLanguage(['de'], 'tlh')).toBe('de');
    expect(detectLanguage(['it'], '')).toBe('en');
  });
});
