/**
 * Plans of the traffic generator (spec 015, "Synthetic traffic"). A plan is
 * data: which players exist and what they do in each turn. It is derived from
 * a seed alone, so two runs with the same seed plan the same actions.
 */

/** A small deterministic generator (mulberry32); good enough to vary a script. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StrokePlan {
  color: string;
  size: number;
  /** Flat x0, y0, x1, y1, … on the 800×600 canvas. */
  points: number[];
}

export interface GuessPlan {
  /** Index into the guessers of the turn, in join order. */
  guesser: number;
  kind: 'wrong' | 'close' | 'correct';
}

export interface TurnPlan {
  wordIndex: number;
  strokes: StrokePlan[];
  fill: boolean;
  guesses: GuessPlan[];
  /** A guesser sends a drawing operation it is not allowed to send. */
  strayDrawBy: number | null;
  /** A guesser drops its connection and resumes its seat after `awayMs`. */
  reconnect: { guesser: number; awayMs: number } | null;
  reaction: boolean;
}

export interface GamePlan {
  seed: number;
  players: number;
  spectator: boolean;
  /** Someone tries a room code that does not exist before the game starts. */
  wrongCode: boolean;
  turns: TurnPlan[];
}

const COLORS = ['#14151C', '#E5484D', '#2F6BFF', '#30A46C', '#F5B041', '#8E4EC6'];
const SIZES = [4, 8, 14];

/** One game of `players` players and one round: every player draws once. */
export function planGame(seed: number, players: number): GamePlan {
  const random = seeded(seed);
  const pick = (count: number) => Math.floor(random() * count);
  const chance = (probability: number) => random() < probability;

  const turns: TurnPlan[] = [];
  for (let turn = 0; turn < players; turn += 1) {
    const guessers = players - 1;
    const strokes: StrokePlan[] = [];
    for (let stroke = 0, count = 2 + pick(4); stroke < count; stroke += 1) {
      const points: number[] = [];
      let x = 80 + pick(640);
      let y = 80 + pick(440);
      for (let point = 0, length = 6 + pick(18); point < length; point += 1) {
        x = Math.min(790, Math.max(10, x + pick(61) - 30));
        y = Math.min(590, Math.max(10, y + pick(61) - 30));
        points.push(x, y);
      }
      strokes.push({
        color: COLORS[pick(COLORS.length)]!,
        size: SIZES[pick(SIZES.length)]!,
        points,
      });
    }

    const guesses: GuessPlan[] = [];
    for (let guesser = 0; guesser < guessers; guesser += 1) {
      if (chance(0.5)) guesses.push({ guesser, kind: 'wrong' });
      if (chance(0.3)) guesses.push({ guesser, kind: 'close' });
      guesses.push({ guesser, kind: 'correct' });
    }

    turns.push({
      wordIndex: pick(2),
      strokes,
      fill: chance(0.3),
      guesses,
      strayDrawBy: chance(0.15) ? pick(guessers) : null,
      reconnect: chance(0.25) ? { guesser: pick(guessers), awayMs: 300 + pick(2200) } : null,
      reaction: chance(0.4),
    });
  }
  return { seed, players, spectator: chance(0.3), wrongCode: chance(0.2), turns };
}

/** The wrong, close and correct text for a word (spec 004: one edit away is close). */
export function guessText(kind: GuessPlan['kind'], word: string): string {
  if (kind === 'correct') return word;
  if (kind === 'wrong') return 'qqqqqqqq';
  const last = word.at(-1) === 'x' ? 'y' : 'x';
  return `${word.slice(0, -1)}${last}`;
}
