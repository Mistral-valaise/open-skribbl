/**
 * Tolerant word comparison (spec 004, "Matching" and "Close guess").
 */

function strip(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function removeMarks(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Diacritics removed: é→e, ñ→n, ü→u, ß→ss. */
export function plainFolding(text: string): string {
  return removeMarks(strip(text).replace(/ß/g, 'ss'));
}

/** German digraphs: ä→ae, ö→oe, ü→ue, ß→ss; other diacritics removed. */
export function digraphFolding(text: string): string {
  const digraphs = strip(text)
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
  return removeMarks(digraphs);
}

export function foldings(text: string): string[] {
  return [...new Set([plainFolding(text), digraphFolding(text)])];
}

/** Stable key for "the same word after normalisation". */
export function wordKey(word: string): string {
  return plainFolding(word);
}

export function isCorrectGuess(guess: string, word: string): boolean {
  const wordForms = foldings(word);
  return foldings(guess).some((form) => form.length > 0 && wordForms.includes(form));
}

export function levenshtein(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  let previous = right.map((_, index) => index + 1);
  previous.unshift(0);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[right.length]!;
}

function closeThreshold(wordLength: number): number {
  if (wordLength < 4) return 0;
  return wordLength < 8 ? 1 : 2;
}

export function isCloseGuess(guess: string, word: string): boolean {
  if (isCorrectGuess(guess, word)) return false;
  const threshold = closeThreshold(Array.from(plainFolding(word)).length);
  if (threshold === 0) return false;
  const wordForms = foldings(word);
  return foldings(guess).some((guessForm) =>
    wordForms.some((wordForm) => levenshtein(guessForm, wordForm) <= threshold),
  );
}
