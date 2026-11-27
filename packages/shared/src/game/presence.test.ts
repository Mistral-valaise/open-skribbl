import { describe, expect, it } from 'vitest';
import { createHarness, startedGame, type Participant } from '../testing/harness.js';

describe('presence (spec 007, groundwork in M1)', () => {
  it('AC-007-01: a dropped participant is shown as disconnected with the score kept', () => {
    const h = createHarness();
    const mara = h.join('Mara');
    const noa = h.join('Noa');
    h.disconnect(noa);
    const seen = h.view(mara).participants.find((p) => p.id === noa.id);
    expect(seen).toMatchObject({ connected: false, score: 0 });
  });

  it('AC-007-02, AC-007-03: a session token resumes the seat with its nickname', () => {
    const h = createHarness();
    h.join('Mara');
    const noa = h.join('Noa');
    h.disconnect(noa);
    h.advance(59_000);
    const back = h.join('Somebody Else', { sessionToken: noa.token });
    expect(back.id).toBe(noa.id);
    expect(h.state.seats).toHaveLength(2);
    expect(h.state.seats.find((seat) => seat.id === noa.id)?.nickname).toBe('Noa');
    expect(h.received(back, 'joined')[0]!.participantId).toBe(noa.id);
  });

  it('AC-007-05: after 60 s the seat is removed and its token starts a new seat', () => {
    const h = createHarness();
    const mara = h.join('Mara');
    const noa = h.join('Noa');
    h.disconnect(noa);
    h.advance(60_000);
    expect(h.view(mara).participants.map((p) => p.id)).toEqual([mara.id]);
    const again = h.join('Noa', { sessionToken: noa.token });
    expect(again.id).not.toBe(noa.id);
  });

  it('AC-007-08: resuming a seat that is still connected replaces the old connection', () => {
    const h = createHarness();
    const mara = h.join('Mara');
    const second = h.join('Mara', { sessionToken: mara.token });
    expect(second.id).toBe(mara.id);
    expect(h.errors(mara.conn)).toEqual(['replaced']);
    expect(h.closed).toContain(mara.conn);
    expect(h.state.seats).toHaveLength(1);
  });

  it('AC-007-11: a player joining mid-turn waits: no word, not counted, cannot leak', () => {
    const { h, players } = startedGame(2, { words: ['house', 'zzz1', 'zzz2'] });
    const [, guesser] = players as Participant[];
    h.choose('house');
    const late = h.join('Late');
    expect(h.view(late).word).toBeNull();
    expect(h.view(late).participants.find((p) => p.id === late.id)?.waiting).toBe(true);
    h.chat(late, 'house');
    expect(h.errors(late)).toEqual(['message_blocked']);
    h.chat(guesser!, 'house');
    expect(h.state.phase).toBe('turnEnd');
  });

  it('AC-007-12: a late joiner guesses next turn and draws within the current round', () => {
    const { h } = startedGame(2, { settings: { rounds: 1, drawTime: 30 } });
    h.choose();
    const late = h.join('Late');
    h.advance(36_000);
    h.choose();
    expect(h.state.turn!.guesserIds).toContain(late.id);
    h.advance(36_000);
    expect(h.state.phase).toBe('choosing');
    expect(h.state.turn!.drawerId).toBe(late.id);
  });

  it('AC-007-15: when the host is removed the earliest connected player becomes host', () => {
    const h = createHarness();
    const mara = h.join('Mara');
    h.join('Watcher', { role: 'spectator' });
    const noa = h.join('Noa');
    h.dispatch({ type: 'leave', participantId: mara.id });
    expect(h.state.hostId).toBe(noa.id);
    const announced = h
      .received(noa, 'chat.message')
      .find((m) => m.kind === 'system' && m.key === 'new_host');
    expect(announced).toMatchObject({ params: { name: 'Noa' } });
  });

  it('AC-007-04: a player who guessed is still marked as guessed after resuming', () => {
    const { h, players } = startedGame(3);
    const guesser = players[1]!;
    const word = h.choose();
    h.chat(guesser, word);
    h.disconnect(guesser);
    h.advance(5_000);
    h.join('ignored', { sessionToken: guesser.token });
    const view = h.view(guesser);
    expect(view.word).toBe(word);
    expect(view.participants.find((p) => p.id === guesser.id)?.hasGuessed).toBe(true);
  });

  it('AC-007-06: an explicit leave removes the seat at once', () => {
    const h = createHarness();
    const mara = h.join('Mara');
    const noa = h.join('Noa');
    h.dispatch({ type: 'leave', participantId: noa.id });
    expect(h.view(mara).participants.map((p) => p.id)).toEqual([mara.id]);
    expect(h.closed).toContain(noa.conn);
  });

  it('AC-007-13: a spectator is never in the turn order or the ranking and sees only the mask', () => {
    const h = createHarness({
      words: ['house', 'zzz1', 'zzz2'],
      settings: { rounds: 1, drawTime: 30 },
    });
    const host = h.join('Mara');
    const watcher = h.join('Watcher', { role: 'spectator' });
    h.join('Noa');
    h.start(host);
    expect(h.state.game!.order).not.toContain(watcher.id);
    h.choose('house');
    expect(h.view(watcher).word).toBeNull();
    expect(h.view(watcher).mask).toBe('_____');
    expect(h.view(watcher).participants.find((p) => p.id === watcher.id)?.rank).toBeNull();
    while (h.state.phase !== 'gameEnd') h.advance(1_000);
    expect(h.view(host).results!.ranking.map((entry) => entry.id)).not.toContain(watcher.id);
  });

  it('AC-007-14: a spectator cannot draw, choose a word or like', () => {
    const h = createHarness();
    const host = h.join('Mara');
    h.join('Noa');
    const watcher = h.join('Watcher', { role: 'spectator' });
    h.start(host);
    h.dispatch({ type: 'chooseWord', participantId: watcher.id, index: 0 });
    h.choose();
    h.dispatch({
      type: 'drawOp',
      participantId: watcher.id,
      op: { type: 'fill', x: 1, y: 1, color: '#000000' },
    });
    h.dispatch({ type: 'like', participantId: watcher.id, value: 'up' });
    expect(h.errors(watcher)).toEqual(['not_allowed', 'not_allowed', 'not_allowed']);
    expect(h.state.turn!.opLog.items).toEqual([]);
  });

  it('AC-007-16: a host who drops and resumes within the grace period stays host', () => {
    const { h, players } = startedGame(3);
    const host = players[0]!;
    h.choose();
    h.disconnect(host);
    h.advance(8_000);
    h.join('ignored', { sessionToken: host.token });
    expect(h.state.hostId).toBe(host.id);
  });

  it('AC-007-07: a player who left with points appears in the results as left', () => {
    const { h, players } = startedGame(3, { settings: { rounds: 1, drawTime: 30 } });
    const [host, quick] = players as Participant[];
    const word = h.choose();
    h.chat(quick!, word);
    h.dispatch({ type: 'leave', participantId: quick!.id });
    while (h.state.phase !== 'gameEnd') h.advance(1_000);
    const entry = h.view(host!).results!.ranking.find((r) => r.id === quick!.id);
    expect(entry).toMatchObject({ left: true, score: 550 });
  });
});
