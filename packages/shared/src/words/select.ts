import { CUSTOM_WORDS_MAX, WORD_MAX_LENGTH } from '../constants.js';
import { wordKey } from './normalize.js';

const WORD_CHARS = /^[\p{L}\p{N} '-]+$/u;
const HAS_LETTER = /[\p{L}\p{N}]/u;

/** A word has 1–30 characters: letters, digits, spaces, hyphens, apostrophes (spec 006). */
export function isValidWord(word: string): boolean {
  const length = Array.from(word).length;
  return length >= 1 && length <= WORD_MAX_LENGTH && WORD_CHARS.test(word) && HAS_LETTER.test(word);
}

export type CustomWordsResult =
  { ok: true; words: string[] } | { ok: false; invalid: string[]; tooMany: boolean };

/** Splits on commas and line breaks, trims, merges duplicates after normalisation. */
export function parseCustomWords(text: string): CustomWordsResult {
  const entries = text
    .split(/[,\n\r]+/)
    .map((entry) => entry.trim().replace(/\s+/g, ' '))
    .filter((entry) => entry.length > 0);
  const invalid = entries.filter((entry) => !isValidWord(entry));
  const seen = new Set<string>();
  const words = entries.filter((entry) => {
    const key = wordKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const tooMany = words.length > CUSTOM_WORDS_MAX;
  if (invalid.length > 0 || tooMany) return { ok: false, invalid, tooMany };
  return { ok: true, words };
}

export interface PickChoicesInput {
  builtin: readonly string[];
  custom: readonly string[];
  customOnly: boolean;
  /** Keys (`wordKey`) of words already offered in this game. */
  used: ReadonlySet<string>;
  count: number;
  random: () => number;
}

/**
 * Offers `count` distinct words (spec 006, "Word selection"). Unused words are
 * preferred; when the pool runs dry, used words become available again.
 */
export function pickChoices(input: PickChoicesInput): string[] {
  const { custom, customOnly, used, count, random } = input;
  const builtin = customOnly ? [] : input.builtin;
  const chosen: string[] = [];
  const chosenKeys = new Set<string>();

  const available = (pool: readonly string[], allowUsed: boolean) =>
    pool.filter((word) => {
      const key = wordKey(word);
      return !chosenKeys.has(key) && (allowUsed || !used.has(key));
    });

  for (let slot = 0; slot < count; slot += 1) {
    let allowUsed = false;
    let fromCustom = available(custom, allowUsed);
    let fromBuiltin = available(builtin, allowUsed);
    if (fromCustom.length === 0 && fromBuiltin.length === 0) {
      allowUsed = true;
      fromCustom = available(custom, allowUsed);
      fromBuiltin = available(builtin, allowUsed);
    }
    if (fromCustom.length === 0 && fromBuiltin.length === 0) break;

    const preferCustom = fromCustom.length > 0 && (customOnly || random() < 0.5);
    const pool = preferCustom || fromBuiltin.length === 0 ? fromCustom : fromBuiltin;
    const word = pool[Math.floor(random() * pool.length)]!;
    chosen.push(word);
    chosenKeys.add(wordKey(word));
  }
  return chosen;
}
