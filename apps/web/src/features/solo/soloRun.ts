import {
  buildMask,
  fitDrawing,
  hintCount,
  hintTimeMs,
  isCloseGuess,
  isCorrectGuess,
  pickHintPosition,
  SOLO,
  soloPoints,
  type Language,
  type SoloDrawing,
} from '@kritzel/shared';

/**
 * A solo run (spec 009) as a pure state machine: the computer replays ten
 * drawings, the player guesses each. Time and randomness come in as arguments.
 */

/** One entry of `categories.json`; a label is null when the category is excluded for that language. */
export type SoloCategory = { id: string; file: string } & Record<Language, string | null>;

/** One drawing of a run: the word to guess and the strokes, already fitted to the canvas. */
export interface SoloRound {
  categoryId: string;
  word: string;
  strokes: readonly (readonly number[])[];
}

export type SoloOutcome = 'guessed' | 'skipped' | 'timeout';

export interface SoloResult {
  word: string;
  points: number;
  outcome: SoloOutcome;
}

export interface SoloGuess {
  text: string;
  /** A wrong guess within a small edit distance of the word (spec 004). */
  close: boolean;
}

export type SoloPhase = 'drawing' | 'reveal' | 'summary';

export interface SoloRunState {
  language: Language;
  rounds: readonly SoloRound[];
  /** The drawing being guessed or revealed, from 0. */
  index: number;
  phase: SoloPhase;
  phaseStartedAt: number;
  /** Wrong guesses for the current drawing, oldest first. */
  guesses: readonly SoloGuess[];
  /** Positions of the word revealed by hints. */
  revealed: readonly number[];
  /** One result per finished drawing. */
  results: readonly SoloResult[];
}

export type SoloEvent = { type: 'guess'; text: string } | { type: 'skip' } | { type: 'tick' };

export interface SoloContext {
  now: number;
  random: () => number;
}

/** Categories that can be played in a language: those with a label in it. */
export function playableCategories(
  categories: readonly SoloCategory[],
  language: Language,
): SoloCategory[] {
  return categories.filter((category) => (category[language] ?? '').trim().length > 0);
}

/** Draws distinct categories at random for one run (spec 009, "Content"). */
export function pickCategories(
  categories: readonly SoloCategory[],
  language: Language,
  random: () => number,
  count: number = SOLO.drawingsPerRun,
): SoloCategory[] {
  const pool = playableCategories(categories, language);
  const picked: SoloCategory[] = [];
  while (picked.length < count && pool.length > 0) {
    const [category] = pool.splice(Math.floor(random() * pool.length), 1);
    picked.push(category!);
  }
  return picked;
}

/** Picks one random drawing for each category and fits it to the canvas. */
export function buildRounds(
  categories: readonly SoloCategory[],
  language: Language,
  drawingsOf: (file: string) => readonly SoloDrawing[],
  random: () => number,
): SoloRound[] {
  return categories.map((category) => {
    const drawings = drawingsOf(category.file);
    const drawing = drawings[Math.floor(random() * drawings.length)] ?? [];
    return {
      categoryId: category.id,
      word: category[language] ?? category.id,
      strokes: fitDrawing(drawing),
    };
  });
}

export function startRun(
  language: Language,
  rounds: readonly SoloRound[],
  now: number,
): SoloRunState {
  return {
    language,
    rounds,
    index: 0,
    phase: rounds.length > 0 ? 'drawing' : 'summary',
    phaseStartedAt: now,
    guesses: [],
    revealed: [],
    results: [],
  };
}

export const currentRound = (state: SoloRunState): SoloRound | undefined =>
  state.rounds[state.index];

/** Time left for the current drawing; 0 outside the drawing phase. */
export function remainingMs(state: SoloRunState, now: number): number {
  if (state.phase !== 'drawing') return 0;
  return Math.min(
    SOLO.timePerDrawingMs,
    Math.max(0, SOLO.timePerDrawingMs - (now - state.phaseStartedAt)),
  );
}

/** The word as the player sees it: blanks, with the letters revealed by hints. */
export function maskOf(state: SoloRunState): string {
  const round = currentRound(state);
  return round ? buildMask(round.word, state.revealed) : '';
}

export const totalPoints = (state: SoloRunState): number =>
  state.results.reduce((sum, result) => sum + result.points, 0);

function finish(
  state: SoloRunState,
  outcome: SoloOutcome,
  points: number,
  now: number,
): SoloRunState {
  const round = currentRound(state);
  if (!round) return state;
  return {
    ...state,
    phase: 'reveal',
    phaseStartedAt: now,
    results: [...state.results, { word: round.word, points, outcome }],
  };
}

/** Applies what the clock alone causes: hints, the time-out and the end of the reveal. */
function settle(state: SoloRunState, ctx: SoloContext): SoloRunState {
  const elapsed = ctx.now - state.phaseStartedAt;

  if (state.phase === 'reveal') {
    if (elapsed < SOLO.revealMs) return state;
    const next = state.index + 1;
    if (next >= state.rounds.length) return { ...state, phase: 'summary', phaseStartedAt: ctx.now };
    return {
      ...state,
      index: next,
      phase: 'drawing',
      phaseStartedAt: ctx.now,
      guesses: [],
      revealed: [],
    };
  }

  const round = currentRound(state);
  if (state.phase !== 'drawing' || !round) return state;
  if (elapsed >= SOLO.timePerDrawingMs) return finish(state, 'timeout', 0, ctx.now);

  // Hints as in multiplayer (spec 006) with `SOLO.hints` hints over the time per drawing.
  const hints = hintCount(round.word, SOLO.hints);
  let revealed = state.revealed;
  for (let hint = revealed.length + 1; hint <= hints; hint += 1) {
    if (elapsed < hintTimeMs(hint, hints, SOLO.timePerDrawingMs)) break;
    const position = pickHintPosition(round.word, revealed, ctx.random);
    if (position === null) break;
    revealed = [...revealed, position];
  }
  return revealed === state.revealed ? state : { ...state, revealed };
}

export function reduceSolo(state: SoloRunState, event: SoloEvent, ctx: SoloContext): SoloRunState {
  const settled = settle(state, ctx);
  const round = currentRound(settled);
  if (event.type === 'tick' || settled.phase !== 'drawing' || !round) return settled;

  if (event.type === 'skip') return finish(settled, 'skipped', 0, ctx.now);

  const text = event.text.trim();
  if (text.length === 0) return settled;
  if (isCorrectGuess(text, round.word)) {
    return finish(settled, 'guessed', soloPoints(remainingMs(settled, ctx.now)), ctx.now);
  }
  return {
    ...settled,
    guesses: [...settled.guesses, { text, close: isCloseGuess(text, round.word) }],
  };
}
