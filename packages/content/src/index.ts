import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Difficulty, Language } from '@kritzel/shared';

/**
 * Word lists (spec 006): `words/<lang>/{easy,medium,hard}.txt`, one word per
 * line, `#` starts a comment. Read from disk once per process.
 */
export const WORD_TIERS = ['easy', 'medium', 'hard'] as const;
export type WordTier = (typeof WORD_TIERS)[number];

/** Next to the source in development, next to the bundle in a production build. */
const defaultWordsDir =
  ['../words', './words']
    .map((path) => fileURLToPath(new URL(path, import.meta.url)))
    .find((path) => existsSync(path)) ?? 'words';

export function parseWordList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().normalize('NFC'))
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export interface WordLists {
  /** `mixed` is the union of the three tiers. Unknown languages fall back to English. */
  get(language: Language, difficulty: Difficulty): readonly string[];
}

export function loadWordLists(wordsDir: string = defaultWordsDir): WordLists {
  const cache = new Map<string, readonly string[]>();

  const tier = (language: Language, name: WordTier): readonly string[] => {
    const key = `${language}/${name}`;
    let list = cache.get(key);
    if (!list) {
      try {
        list = parseWordList(readFileSync(`${wordsDir}/${language}/${name}.txt`, 'utf8'));
      } catch {
        list = [];
      }
      cache.set(key, list);
    }
    return list;
  };

  const get = (language: Language, difficulty: Difficulty): readonly string[] => {
    const key = `${language}/${difficulty}`;
    let list = cache.get(key);
    if (!list) {
      list =
        difficulty === 'mixed'
          ? WORD_TIERS.flatMap((name) => tier(language, name))
          : tier(language, difficulty);
      cache.set(key, list);
    }
    if (list.length === 0 && language !== 'en') return get('en', difficulty);
    return list;
  };

  return { get };
}
