import { describe, expect, it } from 'vitest';
import { createHarness, startedGame, type Harness, type Participant } from '../testing/harness.js';

const chatTexts = (h: Harness, participant: Participant) =>
  h.received(participant, 'chat.message').flatMap((m) => (m.kind === 'chat' ? [m.text] : []));
const systemKeys = (h: Harness, participant: Participant) =>
  h.received(participant, 'chat.message').flatMap((m) => (m.kind === 'system' ? [m.key] : []));

function drawing(word: string, count = 4) {
  const game = startedGame(count, { words: [word, 'zzz1', 'zzz2'] });
  game.h.choose(word);
  game.h.clearInbox();
  return game;
}

describe('guessing and chat (spec 004)', () => {
  it('AC-004-01: a correct guess is swallowed, announced and confirmed to the guesser', () => {
    const { h, players } = drawing('lighthouse');
    const [drawer, quick, slow] = players as Participant[];
    h.chat(quick!, 'Lighthouse');

    for (const player of players) {
      expect(chatTexts(h, player)).toEqual([]);
      expect(systemKeys(h, player)).toEqual(['guessed']);
    }
    expect(h.received(quick!, 'guess.feedback')).toEqual([
      { type: 'guess.feedback', kind: 'correct', text: 'lighthouse' },
    ]);
    expect(h.received(slow!, 'guess.feedback')).toEqual([]);
    expect(drawer).toBeDefined();
  });

  it('AC-004-02: a wrong guess is delivered to everyone on the common channel', () => {
    const { h, players } = drawing('lighthouse');
    h.chat(players[1]!, 'windmill');
    for (const player of players) {
      const message = h.received(player, 'chat.message')[0]!;
      expect(message).toMatchObject({
        kind: 'chat',
        channel: 'all',
        from: players[1]!.id,
        text: 'windmill',
      });
    }
  });

  it('AC-004-08: a close guess is broadcast and only the sender is told it is close', () => {
    const { h, players } = drawing('house');
    const [, sender, other] = players as Participant[];
    h.chat(sender!, 'horse');
    expect(chatTexts(h, other!)).toEqual(['horse']);
    expect(h.received(sender!, 'guess.feedback')).toEqual([
      { type: 'guess.feedback', kind: 'close', text: 'horse' },
    ]);
    expect(h.received(other!, 'guess.feedback')).toEqual([]);
  });

  it('AC-004-09: messages after guessing reach only the drawer and others who guessed', () => {
    const { h, players } = drawing('lighthouse');
    const [drawer, first, second, clueless] = players as Participant[];
    h.chat(first!, 'lighthouse');
    h.chat(first!, 'that was easy');
    h.chat(second!, 'lighthouse');
    h.chat(second!, 'agreed');

    expect(chatTexts(h, drawer!)).toEqual(['that was easy', 'agreed']);
    expect(chatTexts(h, first!)).toEqual(['that was easy', 'agreed']);
    expect(chatTexts(h, second!)).toEqual(['agreed']);
    expect(chatTexts(h, clueless!)).toEqual([]);
    expect(h.received(first!, 'chat.message').find((m) => m.kind === 'chat')?.channel).toBe(
      'guessed',
    );
  });

  it('AC-004-10: the drawer writes on the guessed channel during drawing', () => {
    const { h, players } = drawing('lighthouse');
    const [drawer, guessed, clueless] = players as Participant[];
    h.chat(guessed!, 'lighthouse');
    h.chat(drawer!, 'it is a lighthouse');
    expect(chatTexts(h, guessed!)).toEqual(['it is a lighthouse']);
    expect(chatTexts(h, clueless!)).toEqual([]);
  });

  it('AC-004-11: a player cannot score twice in one turn', () => {
    const { h, players } = drawing('lighthouse');
    const guesser = players[1]!;
    h.chat(guesser, 'lighthouse');
    const score = h.view(guesser).participants.find((p) => p.id === guesser.id)!.score;
    h.chat(guesser, 'lighthouse');
    expect(h.view(guesser).participants.find((p) => p.id === guesser.id)!.score).toBe(score);
    expect(chatTexts(h, guesser)).toEqual(['lighthouse']);
    expect(chatTexts(h, players[2]!)).toEqual([]);
  });

  it('AC-004-12: a spectator cannot leak the word but can chat otherwise', () => {
    const h = createHarness({ words: ['house', 'zzz1', 'zzz2'] });
    const host = h.join('Mara');
    const guesser = h.join('Noa');
    const watcher = h.join('Watcher', { role: 'spectator' });
    h.start(host);
    h.choose('house');
    h.clearInbox();

    h.chat(watcher, 'house');
    h.chat(watcher, 'horse');
    h.chat(watcher, 'nice drawing');

    expect(h.errors(watcher)).toEqual(['message_blocked', 'message_blocked']);
    expect(chatTexts(h, guesser)).toEqual(['nice drawing']);
    expect(h.state.seats.find((seat) => seat.id === watcher.id)?.score).toBe(0);
  });

  it('AC-004-13: outside the drawing phase every message is common chat', () => {
    const { h, players } = drawing('lighthouse', 2);
    const [drawer, guesser] = players as Participant[];
    h.chat(guesser!, 'lighthouse');
    expect(h.state.phase).toBe('turnEnd');
    h.clearInbox();
    h.chat(guesser!, 'lighthouse');
    expect(chatTexts(h, drawer!)).toEqual(['lighthouse']);
    expect(h.received(drawer!, 'chat.message')[0]).toMatchObject({ channel: 'all' });

    const lobby = createHarness();
    const mara = lobby.join('Mara');
    const noa = lobby.join('Noa');
    lobby.chat(mara, 'hello');
    expect(chatTexts(lobby, noa)).toEqual(['hello']);
  });

  it('AC-004-14: empty and overlong messages are rejected', () => {
    const { h, players } = drawing('lighthouse');
    const sender = players[1]!;
    h.chat(sender, '   ');
    h.chat(sender, 'x'.repeat(101));
    h.chat(sender, 'x'.repeat(100));
    expect(h.errors(sender)).toEqual(['invalid_message', 'invalid_message']);
    expect(chatTexts(h, players[2]!)).toEqual(['x'.repeat(100)]);
  });

  it('AC-004-15: when a turn ends everyone receives a system message with the word', () => {
    const { h, players } = drawing('lighthouse');
    h.advance(80_000);
    for (const player of players) {
      const ended = h
        .received(player, 'chat.message')
        .find((m) => m.kind === 'system' && m.key === 'turn_ended');
      expect(ended).toMatchObject({ params: { word: 'lighthouse' } });
    }
  });

  it('AC-004-16: markup is carried as plain text, unchanged', () => {
    const { h, players } = drawing('lighthouse');
    h.chat(players[1]!, '<b>hi</b>');
    expect(chatTexts(h, players[2]!)).toEqual(['<b>hi</b>']);
  });
});
