import { describe, expect, it } from 'vitest';
import { startedGame, type Harness, type Participant } from '../testing/harness.js';

const score = (h: Harness, participant: Participant) =>
  h.state.seats.find((seat) => seat.id === participant.id)?.score;

function drawing(count: number, drawTime = 80) {
  const game = startedGame(count, { settings: { drawTime, rounds: 1 } });
  const word = game.h.choose();
  return { ...game, word };
}

describe('scoring in a game (spec 005)', () => {
  it('AC-005-01, AC-005-03: time-based points, with a bonus for the first guess only', () => {
    const { h, players, word } = drawing(4);
    h.advance(20_000);
    h.chat(players[1]!, word);
    h.chat(players[2]!, word);
    expect(score(h, players[1]!)).toBe(450);
    expect(score(h, players[2]!)).toBe(400);
  });

  it('AC-005-02: a guess at the very start earns 500 before the bonus', () => {
    const { h, players, word } = drawing(4);
    h.chat(players[1]!, word);
    h.chat(players[2]!, word);
    expect(score(h, players[2]!)).toBe(500);
  });

  it('AC-005-13, AC-005-08: the drawer earns half the average over all guessers, and deltas list every player', () => {
    const { h, players, word } = drawing(4);
    const [drawer, a, b, c] = players as Participant[];
    h.advance(20_000);
    h.chat(a!, word); // 400 + 50
    h.advance(20_000);
    h.chat(b!, word); // 100 + floor(400 × 40 / 80) = 300
    h.advance(40_000);

    expect(h.state.phase).toBe('turnEnd');
    expect(score(h, drawer!)).toBe(125);
    expect(h.view(c!).turnEnd?.deltas).toEqual({
      [drawer!.id]: 125,
      [a!.id]: 450,
      [b!.id]: 300,
      [c!.id]: 0,
    });
  });

  it('AC-005-05: the drawer earns nothing when nobody guesses', () => {
    const { h, players } = drawing(3);
    h.advance(80_000);
    expect(score(h, players[0]!)).toBe(0);
    expect(h.view(players[0]!).turnEnd?.deltas[players[0]!.id]).toBe(0);
  });

  it('AC-005-06: when the drawer leaves, guessers keep their points and the drawer earns 0', () => {
    const { h, players, word } = drawing(3);
    const [drawer, guesser] = players as Participant[];
    h.chat(guesser!, word);
    h.disconnect(drawer!);
    h.advance(10_000);
    expect(h.view(guesser!).turnEnd?.reason).toBe('drawer_left');
    expect(score(h, guesser!)).toBe(550);
    expect(score(h, drawer!)).toBe(0);
  });

  it('AC-005-07: guess points apply immediately, drawer points at turn end', () => {
    const { h, players, word } = drawing(3);
    const [drawer, guesser] = players as Participant[];
    h.clearInbox();
    h.chat(guesser!, word);
    const update = h.received(drawer!, 'room.state').at(-1)!.state;
    expect(update.participants.find((p) => p.id === guesser!.id)).toMatchObject({
      score: 550,
      hasGuessed: true,
    });
    expect(update.participants.find((p) => p.id === drawer!.id)?.score).toBe(0);
    h.advance(80_000);
    expect(score(h, drawer!)).toBe(137);
  });

  it('AC-005-10: a guesser who reconnects within the grace period keeps the score', () => {
    const { h, players, word } = drawing(3);
    const guesser = players[1]!;
    h.chat(guesser, word);
    h.disconnect(guesser);
    h.advance(30_000);
    h.join('ignored', { sessionToken: guesser.token });
    expect(score(h, guesser)).toBe(550);
    expect(h.view(guesser).word).toBe(word);
  });

  it('AC-005-11: a guesser who disconnects without guessing still counts in the divisor', () => {
    const { h, players, word } = drawing(4);
    const [drawer, a, b, gone] = players as Participant[];
    h.disconnect(gone!);
    h.chat(a!, word); // 550
    h.chat(b!, word); // 500
    expect(h.state.phase).toBe('turnEnd');
    expect(score(h, drawer!)).toBe(Math.floor(1050 / 6));
  });

  it('AC-005-14: two players who guess at different speeds end with different scores', () => {
    const { h, players, word } = drawing(2);
    const [first, second] = players as Participant[];
    // Turn 1: the first player draws, the second guesses after 10 s.
    h.advance(10_000);
    h.chat(second!, word);
    expect(h.state.phase).toBe('turnEnd');
    expect([score(h, first!), score(h, second!)]).toEqual([250, 500]);

    // Turn 2: roles swapped, the guess comes after 40 s.
    h.advance(6_000);
    const next = h.choose();
    h.advance(40_000);
    h.chat(first!, next);
    expect(h.state.phase).toBe('turnEnd');
    expect([score(h, first!), score(h, second!)]).toEqual([600, 675]);
  });

  it('AC-005-12: a new game in the same room starts with all scores at 0', () => {
    const { h, players, word } = drawing(2, 30);
    const [host, guest] = players as Participant[];
    h.chat(guest!, word);
    h.advance(6_000);
    h.choose();
    h.advance(30_000);
    h.advance(6_000);
    expect(h.state.phase).toBe('gameEnd');
    expect(score(h, guest!)).toBeGreaterThan(0);

    h.dispatch({ type: 'playAgain', participantId: host!.id });
    h.start(host!);
    expect(h.state.phase).toBe('choosing');
    expect(h.state.seats.map((seat) => seat.score)).toEqual([0, 0]);
  });
});
