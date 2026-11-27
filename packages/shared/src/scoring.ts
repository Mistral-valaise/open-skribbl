import { SCORING } from './constants.js';

/** guessPoints = 100 + floor(400 × remaining / drawTime), remaining clamped (spec 005). */
export function guessPoints(remainingMs: number, drawTimeMs: number): number {
  const remaining = Math.min(Math.max(remainingMs, 0), drawTimeMs);
  return SCORING.base + Math.floor((SCORING.timeBonus * remaining) / drawTimeMs);
}

/**
 * drawerPoints = floor(sum of guess points, bonus included / (2 × guessers of the turn))
 * (spec 005). Half the guessers' average: with a single guesser the drawer
 * would otherwise earn exactly what the guesser earned, turn after turn.
 */
export function drawerPoints(guessPointsEarned: readonly number[], guesserCount: number): number {
  if (guesserCount <= 0) return 0;
  const sum = guessPointsEarned.reduce((total, points) => total + points, 0);
  return Math.floor(sum / (SCORING.drawerDivisor * guesserCount));
}

export interface Rankable {
  score: number;
  joinedSeq: number;
}

/** Highest score first; ties share a rank and keep join order (1, 2, 2, 4). */
export function rank<T extends Rankable>(entries: readonly T[]): (T & { rank: number })[] {
  const sorted = [...entries].sort((a, b) => b.score - a.score || a.joinedSeq - b.joinedSeq);
  let currentRank = 0;
  return sorted.map((entry, index) => {
    if (index === 0 || entry.score !== sorted[index - 1]!.score) currentRank = index + 1;
    return { ...entry, rank: currentRank };
  });
}
