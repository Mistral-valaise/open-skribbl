import { describe, expect, it } from 'vitest';
import { guessText, planGame, seeded, withReconnect } from './plan.js';

describe('traffic plans (spec 015)', () => {
  it('AC-015-39: the same seed plans the same actions, another seed different ones', () => {
    expect(planGame(42, 3)).toEqual(planGame(42, 3));
    expect(JSON.stringify(planGame(42, 3))).not.toBe(JSON.stringify(planGame(43, 3)));
    const first = seeded(7);
    const second = seeded(7);
    expect(Array.from({ length: 5 }, first)).toEqual(Array.from({ length: 5 }, second));
  });

  it('AC-015-39: every player draws once and every guesser ends with the correct guess', () => {
    for (const seed of [1, 2, 3, 99]) {
      const plan = planGame(seed, 4);
      expect(plan.turns).toHaveLength(4);
      for (const turn of plan.turns) {
        expect(turn.strokes.length).toBeGreaterThanOrEqual(2);
        for (const stroke of turn.strokes) {
          expect(stroke.points.length % 2).toBe(0);
          expect(stroke.points.every((value) => value >= 0 && value <= 800)).toBe(true);
        }
        for (const guesser of [0, 1, 2]) {
          expect(turn.guesses.filter((guess) => guess.guesser === guesser).at(-1)?.kind).toBe(
            'correct',
          );
        }
      }
    }
  });

  it('guess texts are correct, one edit away, or far off', () => {
    expect(guessText('correct', 'lighthouse')).toBe('lighthouse');
    expect(guessText('close', 'lighthouse')).toBe('lighthousx');
    expect(guessText('close', 'fox')).toBe('foy');
    expect(guessText('wrong', 'lighthouse')).not.toContain('light');
  });

  it('AC-016-22: a plan can be made to include a reconnect, and one that has it is left alone', () => {
    const without = [1, 2, 3, 4, 5, 6, 7, 8]
      .map((seed) => planGame(seed, 3))
      .find((plan) => plan.turns[0]!.reconnect === null)!;
    const forced = withReconnect(without);
    expect(forced.turns[0]!.reconnect).toEqual({ guesser: 0, awayMs: 800 });
    expect(forced.turns.slice(1)).toEqual(without.turns.slice(1));
    expect(withReconnect(forced)).toBe(forced);
  });
});
