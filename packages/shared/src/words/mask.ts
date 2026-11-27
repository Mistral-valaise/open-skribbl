/**
 * Mask and hint schedule (spec 006, "Mask" and "Hints").
 * Positions index the word's code points.
 */

const HIDDEN_CHAR = /[\p{L}\p{N}]/u;
export const MASK_BLANK = '_';

export function hiddenPositions(word: string): number[] {
  return Array.from(word).flatMap((char, index) => (HIDDEN_CHAR.test(char) ? [index] : []));
}

export function buildMask(word: string, revealed: readonly number[] = []): string {
  const shown = new Set(revealed);
  return Array.from(word)
    .map((char, index) => (HIDDEN_CHAR.test(char) && !shown.has(index) ? MASK_BLANK : char))
    .join('');
}

/** Number of hints a turn gets: min(setting, floor((L − 1) / 2)). */
export function hintCount(word: string, setting: number): number {
  const hidden = hiddenPositions(word).length;
  return Math.max(0, Math.min(setting, Math.floor((hidden - 1) / 2)));
}

/** Elapsed drawing time at which hint `index` (1-based) of `total` is revealed. */
export function hintTimeMs(index: number, total: number, drawTimeMs: number): number {
  return (drawTimeMs * index) / (total + 1);
}

/** Picks a still-hidden position at random, or null when none is left. */
export function pickHintPosition(
  word: string,
  revealed: readonly number[],
  random: () => number,
): number | null {
  const shown = new Set(revealed);
  const candidates = hiddenPositions(word).filter((position) => !shown.has(position));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(random() * candidates.length)]!;
}

/** Letter count per written word of a mask or word, e.g. "ice cream" → [3, 5]. */
export function letterCounts(maskOrWord: string): number[] {
  return maskOrWord
    .split(' ')
    .filter((part) => part.length > 0)
    .map((part) => Array.from(part).length);
}
