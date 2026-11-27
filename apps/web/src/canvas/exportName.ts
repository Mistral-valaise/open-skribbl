/** Everything but letters, digits and hyphens becomes a hyphen. */
const UNSAFE = /[^\p{L}\p{N}-]/gu;

/**
 * File name of a downloaded drawing (spec 008, "PNG export"):
 * `kritzel-<word>-<drawer>.png`, lower-cased.
 */
export function exportFileName(word: string, drawer: string): string {
  const clean = (text: string) => text.toLowerCase().replace(UNSAFE, '-');
  return `kritzel-${clean(word)}-${clean(drawer)}.png`;
}
