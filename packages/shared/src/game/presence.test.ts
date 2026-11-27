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
