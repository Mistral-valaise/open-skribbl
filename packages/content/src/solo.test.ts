import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isValidWord, LANGUAGES, wordKey } from '@kritzel/shared';
import { describe, expect, it } from 'vitest';

const soloDir = fileURLToPath(new URL('../solo', import.meta.url));

interface Category {
  id: string;
  file: string;
  en: string | null;
  de: string | null;
  es: string | null;
  fr: string | null;
}

describe('solo content (spec 009)', () => {
  const categories = JSON.parse(readFileSync(`${soloDir}/categories.json`, 'utf8')) as Category[];

  it('AC-009-15: every category has labels and at least 10 well-formed drawings', () => {
    expect(categories.length).toBeGreaterThanOrEqual(100);
    expect(new Set(categories.map((category) => category.file)).size).toBe(categories.length);

    for (const category of categories) {
      for (const language of LANGUAGES) {
        const label = category[language];
        if (label !== null)
          expect(isValidWord(label), `${category.id}/${language}: ${label}`).toBe(true);
      }
      const path = `${soloDir}/drawings/${category.file}.json`;
      expect(existsSync(path), path).toBe(true);
      const drawings = JSON.parse(readFileSync(path, 'utf8')) as number[][][];
      expect(drawings.length, category.id).toBeGreaterThanOrEqual(10);
      for (const strokes of drawings) {
        expect(strokes.length).toBeGreaterThan(0);
        for (const stroke of strokes) {
          expect(stroke.length % 2).toBe(0);
          expect(
            stroke.every((value) => Number.isInteger(value) && value >= 0 && value <= 255),
          ).toBe(true);
        }
      }
    }
  });

  it('labels are unique within each language', () => {
    for (const language of LANGUAGES) {
      const keys = categories.flatMap((category) => {
        const label = category[language];
        return label === null ? [] : [wordKey(label)];
      });
      expect(new Set(keys).size, language).toBe(keys.length);
    }
  });
});
