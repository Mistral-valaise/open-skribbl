import { describe, expect, it } from 'vitest';
import { wordKey } from '../words/normalize.js';
import { startedGame, type Participant } from '../testing/harness.js';

type Trio = [Participant, Participant, Participant];

describe('game loop (spec 002)', () => {
  it('AC-002-01: the game starts in choosing, round 1, with the earliest-joined player drawing', () => {
    const { h, players } = startedGame(3);
    expect(h.state.phase).toBe('choosing');
    expect(h.view(players[0]!).round).toBe(1);
    expect(h.view(players[1]!).drawerId).toBe(players[0]!.id);
  });

  it('AC-002-02: only the drawer receives the configured number of distinct choices', () => {
    const { h, players } = startedGame(3, { settings: { wordChoices: 4 } });
    const [drawer, ...others] = players as Trio;
    const choices = h.received(drawer, 'word.choices');
    expect(choices).toHaveLength(1);
    expect(new Set(choices[0]!.words).size).toBe(4);
    for (const other of others) expect(h.received(other, 'word.choices')).toHaveLength(0);
  });

  it('AC-002-03: a valid choice starts drawing with that word and the full draw time', () => {
    const { h, players } = startedGame(2, { settings: { drawTime: 60 } });
    const word = h.state.turn!.choices[1]!;
    h.dispatch({ type: 'chooseWord', participantId: players[0]!.id, index: 1 });
    expect(h.state.phase).toBe('drawing');
    expect(h.state.turn!.word).toBe(word);
    expect(h.view(players[0]!).phaseEndsAt).toBe(h.now + 60_000);
  });

  it('AC-002-04: choices from others or with a bad index are rejected', () => {
    const { h, players } = startedGame(2);
    h.dispatch({ type: 'chooseWord', participantId: players[1]!.id, index: 0 });
    h.dispatch({ type: 'chooseWord', participantId: players[0]!.id, index: 7 });
    expect(h.state.phase).toBe('choosing');
    expect(h.errors(players[1]!)).toEqual(['not_allowed']);
    expect(h.errors(players[0]!)).toEqual(['not_allowed']);
  });

  it('AC-002-05: after 15 s without a choice an offered word is picked', () => {
    const { h } = startedGame(2);
    const offered = [...h.state.turn!.choices];
    h.advance(14_999);
    expect(h.state.phase).toBe('choosing');
    h.advance(1);
    expect(h.state.phase).toBe('drawing');
    expect(offered).toContain(h.state.turn!.word);
  });

  it('AC-002-06: guessers see the mask; the drawer and those who guessed see the word', () => {
    const { h, players } = startedGame(3, { words: ['lighthouse', 'x1', 'x2'] });
    const [drawer, quick, slow] = players as Trio;
    h.choose('lighthouse');
    h.chat(quick, 'lighthouse');

    expect(h.view(slow).word).toBeNull();
    expect(h.view(slow).mask).toBe('__________');
    expect(JSON.stringify(h.messages(slow))).not.toContain('lighthouse');
    expect(h.view(drawer).word).toBe('lighthouse');
    expect(h.view(quick).word).toBe('lighthouse');
  });

  it('AC-002-07: when the time elapses the turn ends with time_up and everyone sees the word', () => {
    const { h, players } = startedGame(3, { settings: { drawTime: 30 } });
    const word = h.choose();
    h.advance(30_000);
    expect(h.state.phase).toBe('turnEnd');
    for (const player of players) {
      expect(h.view(player).turnEnd?.reason).toBe('time_up');
      expect(h.view(player).word).toBe(word);
    }
  });

  it('AC-002-08: the turn ends early when the last guesser guesses', () => {
    const { h, players } = startedGame(3);
    const [, a, b] = players as Trio;
    const word = h.choose();
    h.advance(5_000);
    h.chat(a, word);
    expect(h.state.phase).toBe('drawing');
    h.chat(b, word);
    expect(h.state.phase).toBe('turnEnd');
    expect(h.view(a).turnEnd?.reason).toBe('all_guessed');
  });

  it('AC-002-09: after 6 s the next player chooses and the op log is empty', () => {
    const { h, players } = startedGame(3, { settings: { drawTime: 30 } });
    h.choose();
    h.dispatch({
      type: 'drawOp',
      participantId: players[0]!.id,
      op: { type: 'fill', x: 1, y: 1, color: '#000000' },
    });
    h.advance(30_000);
    h.advance(5_999);
    expect(h.state.phase).toBe('turnEnd');
    h.advance(1);
    expect(h.state.phase).toBe('choosing');
    expect(h.state.turn!.drawerId).toBe(players[1]!.id);
    expect(h.state.turn!.opLog.items).toEqual([]);
  });

  it('AC-002-10: three players and two rounds give six turns, two per player', () => {
    const { h, players } = startedGame(3, { settings: { rounds: 2, drawTime: 30 } });
    const drawers: string[] = [];
    while (h.state.phase !== 'gameEnd') {
      drawers.push(h.state.turn!.drawerId);
      h.choose();
      h.advance(30_000);
      h.advance(6_000);
    }
    const ids = players.map((player) => player.id);
    expect(drawers).toEqual([...ids, ...ids]);
    expect(h.view(players[0]!).results?.ranking).toHaveLength(3);
  });

  it('AC-002-11: a disconnected player is skipped when their turn comes', () => {
    const { h, players } = startedGame(3, { settings: { drawTime: 30 } });
    const [, second, third] = players as Trio;
    h.choose();
    h.disconnect(second);
    h.advance(30_000);
    h.advance(6_000);
    expect(h.state.phase).toBe('choosing');
    expect(h.state.turn!.drawerId).toBe(third.id);
  });

  it('AC-002-12: a drawer who stays away for 10 s ends the turn with drawer_left', () => {
    const { h, players } = startedGame(3);
    const [drawer, guesser] = players as Trio;
    h.choose();
    h.disconnect(drawer);
    h.advance(9_999);
    expect(h.state.phase).toBe('drawing');
    h.advance(1);
    expect(h.state.phase).toBe('turnEnd');
    expect(h.view(guesser).turnEnd?.reason).toBe('drawer_left');
  });

  it('AC-002-13: a drawer who returns within 10 s continues with the same deadline', () => {
    const { h, players } = startedGame(3);
    const drawer = players[0]!;
    h.choose();
    const deadline = h.state.phaseEndsAt;
    h.disconnect(drawer);
    h.advance(5_000);
    h.join('ignored', { sessionToken: drawer.token });
    h.advance(20_000);
    expect(h.state.phase).toBe('drawing');
    expect(h.state.phaseEndsAt).toBe(deadline);
    expect(h.state.seats.find((seat) => seat.id === drawer.id)?.connId).not.toBeNull();
  });

  it('AC-002-14: fewer than two connected players for 10 s ends the turn and then the game', () => {
    const { h, players } = startedGame(2);
    const [drawer, guesser] = players as [Participant, Participant];
    h.choose();
    h.disconnect(guesser);
    h.advance(9_999);
    expect(h.state.phase).toBe('drawing');
    h.advance(1);
    expect(h.state.phase).toBe('turnEnd');
    expect(h.view(drawer).turnEnd?.reason).toBe('not_enough_players');
    h.advance(6_000);
    expect(h.state.phase).toBe('gameEnd');
  });

  it('a short disconnect in a two-player game does not end it', () => {
    const { h, players } = startedGame(2);
    const guesser = players[1]!;
    h.choose();
    h.disconnect(guesser);
    h.advance(3_000);
    h.join('ignored', { sessionToken: guesser.token });
    h.advance(20_000);
    expect(h.state.phase).toBe('drawing');
  });

  it('AC-002-15: no word is offered twice while unused words remain', () => {
    const words = Array.from({ length: 12 }, (_, index) => `word${index}`);
    const { h } = startedGame(2, { words, settings: { rounds: 2, drawTime: 30, wordChoices: 3 } });
    const offered: string[] = [];
    while (h.state.phase !== 'gameEnd') {
      offered.push(...h.state.turn!.choices);
      h.choose();
      h.advance(30_000);
      h.advance(6_000);
    }
    expect(offered).toHaveLength(12);
    expect(new Set(offered.map(wordKey)).size).toBe(12);
  });

  it('AC-002-16: every snapshot carries serverNow next to the phase deadline', () => {
    const { h, players } = startedGame(2, { settings: { drawTime: 60 } });
    h.choose();
    h.advance(12_000);
    const view = h.view(players[1]!);
    expect(view.serverNow).toBe(h.now);
    expect(view.phaseEndsAt! - view.serverNow).toBe(48_000);
  });

  it('AC-002-17: the same events, clock and random sequence give the same final state', () => {
    const run = () => {
      const { h, players } = startedGame(3, { seed: 42, settings: { rounds: 2, drawTime: 30 } });
      while (h.state.phase !== 'gameEnd') {
        const word = h.choose();
        h.advance(4_000);
        const guesser = players.find((player) => player.id !== h.state.turn!.drawerId)!;
        h.chat(guesser, word);
        h.advance(30_000);
        h.advance(6_000);
      }
      return h.state;
    };
    expect(run()).toEqual(run());
  });

  it('hints are revealed on schedule and stay revealed (AC-006-15, AC-006-17, AC-006-18)', () => {
    const { h, players } = startedGame(2, {
      words: ['lighthouse', 'x1', 'x2'],
      settings: { drawTime: 80, hints: 2 },
    });
    const guesser = players[1]!;
    const revealed = () => [...h.view(guesser).mask!].filter((char) => char !== '_').length;
    h.choose('lighthouse');
    h.advance(26_000);
    expect(revealed()).toBe(0);
    h.advance(1_000);
    expect(revealed()).toBe(1);
    const first = h.view(guesser).mask!;
    h.advance(27_000);
    expect(revealed()).toBe(2);
    const second = h.view(guesser).mask!;
    expect([...first].every((char, index) => char === '_' || second[index] === char)).toBe(true);
    expect([...second].every((char, index) => char === '_' || 'lighthouse'[index] === char)).toBe(
      true,
    );

    const none = startedGame(2, { words: ['lighthouse', 'x1', 'x2'], settings: { hints: 0 } });
    none.h.choose('lighthouse');
    none.h.advance(79_000);
    expect(none.h.view(none.players[1]!).mask).toBe('__________');
  });
});
