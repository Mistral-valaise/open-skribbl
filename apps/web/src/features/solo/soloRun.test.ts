import { readFileSync } from 'node:fs';
import { CANVAS_HEIGHT, CANVAS_WIDTH, planReplay, replayAt, SOLO } from '@kritzel/shared';
import { describe, expect, it } from 'vitest';
import { parseCategories, parseDrawings } from './soloContent.js';
import {
  buildRounds,
  maskOf,
  pickCategories,
  playableCategories,
  reduceSolo,
  remainingMs,
  startRun,
  totalPoints,
  type SoloCategory,
  type SoloEvent,
  type SoloRound,
  type SoloRunState,
} from './soloRun.js';

/** A deterministic random source; nearby seeds give unrelated sequences. */
function sequence(seed: number): () => number {
  let state = (seed * 2654435761) % 4294967296;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const content = (path: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../../../../packages/content/solo/${path}`, import.meta.url), 'utf8'),
  );
const categories = parseCategories(content('categories.json'));

const START = 1_000_000;
const round = (word: string): SoloRound => ({
  categoryId: word,
  word,
  strokes: [
    [100, 100, 300, 100],
    [300, 100, 300, 300],
  ],
});

/** A run over the given words, started at `START`. */
const runOf = (...words: string[]) => startRun('en', words.map(round), START);

/** Feeds events at the given times (ms after `START`); the random source picks the first hint position. */
function play(state: SoloRunState, steps: readonly (readonly [at: number, event: SoloEvent])[]) {
  return steps.reduce(
    (current, [at, event]) => reduceSolo(current, event, { now: START + at, random: () => 0 }),
    state,
  );
}

const tick: SoloEvent = { type: 'tick' };
const guess = (text: string): SoloEvent => ({ type: 'guess', text });

describe('solo run: content', () => {
  it('AC-009-02: a run has ten distinct categories with a label in the chosen language', () => {
    for (const language of ['en', 'de', 'es', 'fr'] as const) {
      for (let seed = 1; seed <= 25; seed += 1) {
        const picked = pickCategories(categories, language, sequence(seed));
        expect(picked).toHaveLength(SOLO.drawingsPerRun);
        expect(new Set(picked.map((category) => category.id)).size).toBe(SOLO.drawingsPerRun);
        for (const category of picked) expect(category[language]).toBeTruthy();
      }
    }
  });

  it('AC-009-02: a category excluded for a language is never picked for it', () => {
    const some: SoloCategory[] = Array.from({ length: 12 }, (_, index) => ({
      id: `c${index}`,
      file: `c${index}`,
      en: `word ${index}`,
      de: index < 3 ? null : `Wort ${index}`,
      es: `palabra ${index}`,
      fr: index === 5 ? '' : `mot ${index}`,
    }));
    expect(playableCategories(some, 'de').map((category) => category.id)).not.toContain('c0');
    expect(playableCategories(some, 'fr')).toHaveLength(11);
    for (let seed = 1; seed <= 20; seed += 1) {
      const picked = pickCategories(some, 'de', sequence(seed));
      // Only nine German labels exist: the run is as long as the content allows, never padded.
      expect(picked).toHaveLength(9);
      expect(picked.every((category) => category.de !== null)).toBe(true);
    }
  });

  it('AC-009-02: each drawing of a run is one random drawing of its category', () => {
    const picked = pickCategories(categories, 'de', sequence(7));
    const files = new Map(
      picked.map((category) => [
        category.file,
        parseDrawings(content(`drawings/${category.file}.json`)),
      ]),
    );
    const chosen = new Set<string>();
    for (let seed = 1; seed <= 12; seed += 1) {
      const rounds = buildRounds(picked, 'de', (file) => files.get(file) ?? [], sequence(seed));
      expect(rounds).toHaveLength(SOLO.drawingsPerRun);
      rounds.forEach((entry, index) => {
        expect(entry.categoryId).toBe(picked[index]!.id);
        expect(entry.word).toBe(picked[index]!.de);
        expect(entry.strokes.length).toBeGreaterThan(0);
      });
      chosen.add(JSON.stringify(rounds[0]!.strokes));
    }
    // Different runs get different drawings of the same category.
    expect(chosen.size).toBeGreaterThan(1);
  });

  it('AC-009-04: the drawings of a run are fitted to the canvas with a 10 % margin', () => {
    const picked = pickCategories(categories, 'en', sequence(3));
    const rounds = buildRounds(
      picked,
      'en',
      (file) => parseDrawings(content(`drawings/${file}.json`)),
      sequence(4),
    );
    for (const entry of rounds) {
      const xs = entry.strokes.flatMap((stroke) => stroke.filter((_, index) => index % 2 === 0));
      const ys = entry.strokes.flatMap((stroke) => stroke.filter((_, index) => index % 2 === 1));
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(CANVAS_WIDTH * SOLO.margin - 1);
      expect(Math.max(...xs)).toBeLessThanOrEqual(CANVAS_WIDTH * (1 - SOLO.margin) + 1);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(CANVAS_HEIGHT * SOLO.margin - 1);
      expect(Math.max(...ys)).toBeLessThanOrEqual(CANVAS_HEIGHT * (1 - SOLO.margin) + 1);
    }
  });

  it('AC-009-03: the replay of a round draws its strokes in order and is complete after 15 s', () => {
    const { strokes } = round('house');
    const plan = planReplay(strokes);
    expect(replayAt(plan, 0).map((item) => item.id)).toEqual(['replay-0']);
    const half = replayAt(plan, SOLO.replayMs / 2);
    expect(half[0]!.done).toBe(true);
    const done = replayAt(plan, SOLO.replayMs);
    expect(done.map((item) => item.points)).toEqual(strokes);
    expect(done.every((item) => item.done)).toBe(true);
  });
});

describe('solo run: guessing', () => {
  it('AC-009-05: a correct guess with 15 s left scores 300, at the first instant 500', () => {
    const half = play(runOf('house'), [[15_000, guess('house')]]);
    expect(half.results).toEqual([{ word: 'house', points: 300, outcome: 'guessed' }]);
    const instant = play(runOf('house'), [[0, guess('House')]]);
    expect(instant.results[0]!.points).toBe(500);
    const last = play(runOf('house'), [[29_999, guess('house')]]);
    expect(last.results[0]!.points).toBe(100);
  });

  it('AC-009-05: a skip and a time-out score 0', () => {
    const skipped = play(runOf('house'), [[4_000, { type: 'skip' }]]);
    expect(skipped.results).toEqual([{ word: 'house', points: 0, outcome: 'skipped' }]);
    const late = play(runOf('house'), [[SOLO.timePerDrawingMs, tick]]);
    expect(late.results).toEqual([{ word: 'house', points: 0, outcome: 'timeout' }]);
    // A guess that arrives after the time is up is too late, even if it is right.
    const tooLate = play(runOf('house'), [[SOLO.timePerDrawingMs + 5, guess('house')]]);
    expect(tooLate.results[0]).toMatchObject({ points: 0, outcome: 'timeout' });
  });

  it('AC-009-06: with word language de, "cat" is solved by "Katze" and not by "cat"', () => {
    const cat = categories.find((category) => category.id === 'cat')!;
    expect(cat.de).toBe('Katze');
    const rounds = buildRounds(
      [cat],
      'de',
      () => [[[0, 0, 255, 255]]],
      () => 0,
    );
    const wrong = play(startRun('de', rounds, START), [[1_000, guess('cat')]]);
    expect(wrong.phase).toBe('drawing');
    expect(wrong.results).toHaveLength(0);
    expect(wrong.guesses.map((entry) => entry.text)).toEqual(['cat']);
    const right = play(wrong, [[2_000, guess('katze')]]);
    expect(right.results[0]).toMatchObject({ word: 'Katze', outcome: 'guessed' });
  });

  it('AC-009-07: tolerant matching applies: "senal de stop" solves "señal de stop"', () => {
    const sign = categories.find((category) => category.id === 'stop sign')!;
    expect(sign.es).toBe('señal de stop');
    const rounds = buildRounds(
      [sign],
      'es',
      () => [[[0, 0, 255, 255]]],
      () => 0,
    );
    const solved = play(startRun('es', rounds, START), [[3_000, guess('  Senal de STOP ')]]);
    expect(solved.results[0]).toMatchObject({ word: 'señal de stop', outcome: 'guessed' });
  });

  it('AC-009-08: a close guess is marked as close, other wrong guesses are listed unmarked', () => {
    const state = play(runOf('house'), [
      [1_000, guess('horse')],
      [2_000, guess('tree')],
      [3_000, guess('   ')],
      [4_000, guess('hose')],
    ]);
    expect(state.guesses).toEqual([
      { text: 'horse', close: true },
      { text: 'tree', close: false },
      { text: 'hose', close: true },
    ]);
    expect(state.phase).toBe('drawing');
    // Guesses cost nothing: a later correct guess scores by time alone.
    expect(play(state, [[15_000, guess('house')]]).results[0]!.points).toBe(300);
  });

  it('AC-009-09: the mask shows one revealed letter after 10 s and two after 20 s', () => {
    const run = runOf('house');
    expect(maskOf(play(run, [[9_900, tick]]))).toBe('_____');
    expect(maskOf(play(run, [[10_000, tick]]))).toBe('h____');
    const later = play(run, [
      [10_000, tick],
      [19_900, tick],
    ]);
    expect(maskOf(later)).toBe('h____');
    expect(maskOf(play(later, [[20_000, tick]]))).toBe('ho___');
    // Both hints appear even when the clock was not looked at in between.
    expect(maskOf(play(run, [[25_000, tick]])).replace(/_/g, '')).toHaveLength(2);
    expect(maskOf(play(run, [[29_000, tick]])).replace(/_/g, '')).toHaveLength(2);
  });

  it('AC-009-09: short words get fewer hints, as in multiplayer', () => {
    expect(maskOf(play(runOf('cat'), [[29_000, tick]])).replace(/_/g, '')).toHaveLength(1);
    expect(maskOf(play(runOf('ox'), [[29_000, tick]]))).toBe('__');
    expect(maskOf(play(runOf('ice cream'), [[0, tick]]))).toBe('___ _____');
  });

  it('AC-009-10: the word is revealed for 2.5 s after a correct guess, a skip or a time-out', () => {
    const afterGuess = play(runOf('house', 'tree'), [[5_000, guess('house')]]);
    const afterSkip = play(runOf('house', 'tree'), [[5_000, { type: 'skip' }]]);
    const afterTimeout = play(runOf('house', 'tree'), [[SOLO.timePerDrawingMs, tick]]);
    for (const [revealed, since] of [
      [afterGuess, 5_000],
      [afterSkip, 5_000],
      [afterTimeout, SOLO.timePerDrawingMs],
    ] as const) {
      expect(revealed.phase).toBe('reveal');
      expect(revealed.index).toBe(0);
      const still = play(revealed, [[since + SOLO.revealMs - 1, tick]]);
      expect(still.phase).toBe('reveal');
      // Nothing can be guessed or skipped during the reveal.
      expect(play(still, [[since + SOLO.revealMs - 1, guess('tree')]])).toBe(still);
      const next = play(revealed, [[since + SOLO.revealMs, tick]]);
      expect(next).toMatchObject({ phase: 'drawing', index: 1, guesses: [], revealed: [] });
      expect(remainingMs(next, START + since + SOLO.revealMs)).toBe(SOLO.timePerDrawingMs);
    }
  });

  it('AC-009-11: after ten drawings the summary has the ten words, their points and the total', () => {
    const words = [
      'house',
      'tree',
      'apple',
      'chair',
      'river',
      'cloud',
      'bread',
      'snake',
      'piano',
      'robot',
    ];
    let state = runOf(...words);
    let now = 0;
    words.forEach((word, index) => {
      expect(state).toMatchObject({ phase: 'drawing', index });
      // Even drawings are guessed after 15 s, every third one is skipped, the rest time out.
      const event: SoloEvent =
        index % 2 === 0 ? guess(word) : index % 3 === 0 ? { type: 'skip' } : tick;
      now += index % 2 === 0 || index % 3 === 0 ? 15_000 : SOLO.timePerDrawingMs;
      state = play(state, [[now, event]]);
      expect(state.phase).toBe('reveal');
      now += SOLO.revealMs;
      state = play(state, [[now, tick]]);
    });
    expect(state.phase).toBe('summary');
    expect(state.results.map((result) => result.word)).toEqual(words);
    expect(state.results.map((result) => result.points)).toEqual([
      300, 0, 300, 0, 300, 0, 300, 0, 300, 0,
    ]);
    expect(state.results.map((result) => result.outcome)).toEqual([
      'guessed',
      'timeout',
      'guessed',
      'skipped',
      'guessed',
      'timeout',
      'guessed',
      'timeout',
      'guessed',
      'skipped',
    ]);
    expect(totalPoints(state)).toBe(1500);
    // The summary is final.
    expect(play(state, [[now + 60_000, guess('house')]])).toBe(state);
  });

  it('AC-009-10: after a long pause the run continues with the reveal, one step at a time', () => {
    // The tab was in the background for two minutes during the first drawing.
    const woke = play(runOf('house', 'tree'), [[120_000, tick]]);
    expect(woke).toMatchObject({ phase: 'reveal', index: 0 });
    expect(woke.results).toEqual([{ word: 'house', points: 0, outcome: 'timeout' }]);
    const next = play(woke, [[120_000 + SOLO.revealMs, tick]]);
    expect(next).toMatchObject({ phase: 'drawing', index: 1 });
  });
});
