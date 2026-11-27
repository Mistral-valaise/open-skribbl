import { describe, expect, it } from 'vitest';
import { createHarness, startedGame, type Harness, type Participant } from '../testing/harness.js';

const like = (h: Harness, who: Participant, value: 'up' | 'down') =>
  h.dispatch({ type: 'like', participantId: who.id, value });
const react = (h: Harness, who: Participant, emoji: string) =>
  h.dispatch({ type: 'reaction', participantId: who.id, emoji });

/** Plays the current turn to its end by time-out and moves to the next phase. */
function finishTurn(h: Harness) {
  h.advance(h.state.settings.drawTime * 1000);
  h.advance(6_000);
}

describe('reactions (spec 008)', () => {
  it("AC-008-01: a guesser's reaction reaches everyone, including the drawer", () => {
    const { h, players } = startedGame(3);
    h.choose();
    react(h, players[1]!, '🔥');
    for (const player of players) {
      expect(h.received(player, 'reaction')).toEqual([
        { type: 'reaction', participantId: players[1]!.id, emoji: '🔥' },
      ]);
    }
  });

  it('AC-008-02: reactions from the drawer, outside drawing, or with an unknown emoji are refused', () => {
    const { h, players } = startedGame(3);
    const [drawer, guesser] = players as Participant[];
    react(h, guesser!, '🔥'); // choosing phase
    h.choose();
    react(h, drawer!, '🔥');
    react(h, guesser!, '🍕');
    expect(h.errors(guesser!)).toEqual(['not_allowed', 'not_allowed']);
    expect(h.errors(drawer!)).toEqual(['not_allowed']);
    expect(h.received(players[2]!, 'reaction')).toEqual([]);
  });

  it('AC-008-03: a second reaction within 1.5 s is not delivered', () => {
    const { h, players } = startedGame(3);
    const [, guesser, other] = players as Participant[];
    h.choose();
    react(h, guesser!, '🔥');
    h.advance(1_499);
    react(h, guesser!, '👏');
    expect(h.received(other!, 'reaction')).toHaveLength(1);
    expect(h.errors(guesser!)).toEqual([]);
    h.advance(1);
    react(h, guesser!, '👏');
    expect(h.received(other!, 'reaction')).toHaveLength(2);
  });

  it('spectators may react', () => {
    const h = createHarness();
    const host = h.join('Mara');
    h.join('Noa');
    const watcher = h.join('Watcher', { role: 'spectator' });
    h.start(host);
    h.choose();
    react(h, watcher, '😂');
    expect(h.received(host, 'reaction')).toHaveLength(1);
  });
});

describe('likes (spec 008)', () => {
  it('AC-008-04, AC-008-06: a changed like counts once; totals appear only at turn end', () => {
    const { h, players } = startedGame(3, { settings: { drawTime: 30 } });
    const [drawer, a, b] = players as Participant[];
    h.choose();
    like(h, a!, 'up');
    like(h, a!, 'down');
    like(h, b!, 'up');
    expect(h.view(drawer!).turnEnd).toBeNull();
    expect(JSON.stringify(h.view(drawer!))).not.toContain('likes');

    h.advance(30_000);
    expect(h.view(drawer!).turnEnd?.likes).toEqual({ up: 1, down: 1 });
  });

  it('AC-008-05: the drawer, spectators and waiting players cannot like', () => {
    const h = createHarness();
    const host = h.join('Mara');
    h.join('Noa');
    const watcher = h.join('Watcher', { role: 'spectator' });
    h.start(host);
    h.choose();
    const late = h.join('Late');
    for (const who of [host, watcher, late]) {
      like(h, who, 'up');
      expect(h.errors(who)).toEqual(['not_allowed']);
    }
    expect(h.state.turn!.likes).toEqual({});
  });

  it('a like during the turn-end display still counts in the gallery', () => {
    const { h, players } = startedGame(2, { settings: { drawTime: 30, rounds: 1 } });
    h.choose();
    h.advance(30_000);
    like(h, players[1]!, 'up');
    expect(h.view(players[0]!).turnEnd?.likes).toEqual({ up: 1, down: 0 });
    h.advance(6_000);
    h.choose();
    finishTurn(h);
    expect(h.state.phase).toBe('gameEnd');
    expect(h.view(players[0]!).results?.gallery[0]).toMatchObject({ likesUp: 1, likesDown: 0 });
  });
});

describe('results and gallery (spec 008)', () => {
  function playedGame() {
    const game = startedGame(3, { settings: { rounds: 1, drawTime: 30 } });
    const { h, players } = game;
    const words: string[] = [];
    const likesPerTurn = [2, 1, 2];
    for (let turn = 0; turn < 3; turn += 1) {
      words.push(h.choose());
      const drawerId = h.state.turn!.drawerId;
      h.dispatch({
        type: 'drawOp',
        participantId: drawerId,
        op: { type: 'fill', x: turn + 1, y: 1, color: '#000000' },
      });
      const guessers = players.filter((player) => player.id !== drawerId);
      guessers.slice(0, likesPerTurn[turn]).forEach((guesser) => like(h, guesser, 'up'));
      finishTurn(h);
    }
    expect(h.state.phase).toBe('gameEnd');
    return { ...game, words };
  }

  it('AC-008-07: the game-end snapshot lists one gallery entry per turn in play order', () => {
    const { h, players, words } = playedGame();
    const gallery = h.view(players[2]!).results!.gallery;
    expect(gallery.map((entry) => entry.word)).toEqual(words);
    expect(gallery.map((entry) => entry.drawerName)).toEqual(['Player1', 'Player2', 'Player3']);
    expect(gallery.map((entry) => entry.turnIndex)).toEqual([0, 1, 2]);
    expect(gallery[1]).toMatchObject({ round: 1, likesUp: 1, likesDown: 0, guesserCount: 2 });
  });

  it('AC-008-08: gallery.get returns the drawing at game end and is refused otherwise', () => {
    const { h, players } = playedGame();
    const viewer = players[1]!;
    h.dispatch({ type: 'galleryGet', participantId: viewer.id, turnIndex: 1 });
    expect(h.received(viewer, 'gallery.drawing')).toEqual([
      {
        type: 'gallery.drawing',
        turnIndex: 1,
        items: [{ kind: 'fill', x: 2, y: 1, color: '#000000' }],
      },
    ]);
    h.dispatch({ type: 'galleryGet', participantId: viewer.id, turnIndex: 9 });
    expect(h.errors(viewer)).toEqual(['not_allowed']);

    const running = startedGame(2);
    running.h.choose();
    running.h.dispatch({ type: 'galleryGet', participantId: running.players[1]!.id, turnIndex: 0 });
    expect(running.h.errors(running.players[1]!)).toEqual(['not_allowed']);
  });

  it('AC-008-09: the crowd favourite has the most thumbs-up, the earlier turn wins a tie', () => {
    const { h, players } = playedGame(); // 2, 1, 2 thumbs-up
    expect(h.view(players[0]!).results!.favorite).toBe(0);

    const none = startedGame(2, { settings: { rounds: 1, drawTime: 30 } });
    none.h.choose();
    finishTurn(none.h);
    none.h.choose();
    finishTurn(none.h);
    expect(none.h.view(none.players[0]!).results!.favorite).toBeNull();
  });

  it('AC-008-13: after play again the previous gallery is gone', () => {
    const { h, players } = playedGame();
    h.dispatch({ type: 'playAgain', participantId: players[0]!.id });
    h.dispatch({ type: 'galleryGet', participantId: players[0]!.id, turnIndex: 0 });
    expect(h.errors(players[0]!)).toEqual(['not_allowed']);
  });

  it('a turn the drawer left before drawing anything is not in the gallery', () => {
    const { h, players } = startedGame(3, { settings: { rounds: 1, drawTime: 30 } });
    h.choose();
    h.disconnect(players[0]!);
    h.advance(10_000);
    expect(h.state.game!.turns).toHaveLength(0);
  });
});

describe('words and languages in a room (spec 006)', () => {
  it('AC-006-04: system messages carry a key and parameters, not rendered text', () => {
    const { h, players } = startedGame(2, { words: ['lighthouse', 'x1', 'x2'] });
    h.choose('lighthouse');
    h.clearInbox();
    h.chat(players[1]!, 'lighthouse');
    const system = h.received(players[0]!, 'chat.message').filter((m) => m.kind === 'system');
    expect(system).toMatchObject([
      { key: 'guessed', params: { name: 'Player2' } },
      { key: 'turn_ended', params: { word: 'lighthouse' } },
    ]);
    expect(system.every((message) => !('text' in message))).toBe(true);
  });

  const custom = Array.from({ length: 12 }, (_, index) => `custom${index}`);

  it('AC-006-08: with customWordsOnly every offered word is a custom word', () => {
    const h = createHarness({ settings: { rounds: 2 } });
    const host = h.join('Mara');
    h.join('Noa');
    h.dispatch({
      type: 'updateSettings',
      participantId: host.id,
      patch: { customWords: custom, customWordsOnly: true },
    });
    h.start(host);
    for (let turn = 0; turn < 4; turn += 1) {
      expect(h.state.turn!.choices.every((word) => custom.includes(word))).toBe(true);
      h.choose();
      finishTurn(h);
    }
  });

  it('AC-006-09: customWordsOnly needs at least 10 custom words', () => {
    const h = createHarness();
    const host = h.join('Mara');
    h.dispatch({
      type: 'updateSettings',
      participantId: host.id,
      patch: { customWords: custom.slice(0, 9), customWordsOnly: true },
    });
    expect(h.errors(host)).toEqual(['invalid_custom_words']);
    expect(h.state.settings.customWordsOnly).toBe(false);
    expect(h.state.settings.customWords).toEqual([]);
  });

  it('AC-006-11: too many or overlong custom words are rejected and change nothing', () => {
    const h = createHarness();
    const host = h.join('Mara');
    const tooMany = Array.from({ length: 501 }, (_, index) => `word${index}`);
    h.dispatch({ type: 'updateSettings', participantId: host.id, patch: { customWords: tooMany } });
    h.dispatch({
      type: 'updateSettings',
      participantId: host.id,
      patch: { customWords: ['x'.repeat(31)] },
    });
    h.dispatch({ type: 'updateSettings', participantId: host.id, patch: { customWords: ['<b>'] } });
    expect(h.errors(host)).toHaveLength(3);
    expect(h.state.settings.customWords).toEqual([]);
  });

  it('AC-006-12: only the host sees the custom words; everyone sees their count', () => {
    const h = createHarness();
    const host = h.join('Mara');
    const guest = h.join('Noa');
    h.dispatch({ type: 'updateSettings', participantId: host.id, patch: { customWords: custom } });
    expect(h.view(host).settings.customWords).toEqual(custom);
    expect(h.view(guest).settings.customWords).toEqual([]);
    expect(h.view(guest).customWordCount).toBe(12);
    expect(JSON.stringify(h.messages(guest))).not.toContain('custom0');
  });
});
