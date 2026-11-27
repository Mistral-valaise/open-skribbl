import { describe, expect, it } from 'vitest';
import { createHarness, startedGame } from '../testing/harness.js';

describe('rooms and lobby (spec 001)', () => {
  it('AC-001-02: the first participant is host and the room starts in the lobby', () => {
    const h = createHarness();
    const mara = h.join('Mara');
    h.join('Noa');
    expect(h.state.phase).toBe('lobby');
    expect(h.state.hostId).toBe(mara.id);
    expect(h.received(mara, 'joined')[0]?.state.hostId).toBe(mara.id);
  });

  it('AC-001-05: a full room rejects players but still admits spectators', () => {
    const h = createHarness({ settings: { maxPlayers: 2 } });
    h.join('Mara');
    h.join('Noa');
    const late = h.join('Late');
    expect(late.id).toBe('');
    expect(h.errors(late.conn)).toEqual(['room_full']);
    expect(h.closed).toContain(late.conn);

    const watcher = h.join('Watcher', { role: 'spectator' });
    expect(h.view(watcher).you.role).toBe('spectator');
    expect(h.state.seats).toHaveLength(3);
  });

  it('AC-001-06: a host settings update reaches every participant', () => {
    const h = createHarness();
    const mara = h.join('Mara');
    const noa = h.join('Noa');
    h.clearInbox();
    h.dispatch({
      type: 'updateSettings',
      participantId: mara.id,
      patch: { rounds: 5, drawTime: 60 },
    });
    for (const participant of [mara, noa]) {
      const settings = h.received(participant, 'room.state').at(-1)?.state.settings;
      expect(settings).toMatchObject({ rounds: 5, drawTime: 60, wordChoices: 3 });
    }
  });

  it('AC-001-07: settings updates from non-hosts or outside the lobby are refused', () => {
    const { h, players } = startedGame(2);
    const [host, other] = players as [(typeof players)[0], (typeof players)[0]];
    h.dispatch({ type: 'updateSettings', participantId: host.id, patch: { rounds: 5 } });
    expect(h.errors(host)).toEqual(['not_allowed']);
    expect(h.state.settings.rounds).toBe(3);

    const lobby = createHarness();
    lobby.join('Mara');
    const guest = lobby.join('Noa');
    lobby.dispatch({ type: 'updateSettings', participantId: guest.id, patch: { rounds: 5 } });
    expect(lobby.errors(guest)).toEqual(['not_allowed']);
    expect(lobby.state.settings.rounds).toBe(3);
    expect(other.id).not.toBe('');
  });

  it('AC-001-08: an update with any out-of-range value changes nothing', () => {
    const h = createHarness();
    const mara = h.join('Mara');
    const before = h.state.settings;
    const invalid: unknown[] = [
      { rounds: 5, drawTime: 20 },
      { rounds: 11 },
      { drawTime: 65 },
      { wordChoices: 6 },
      { hints: -1 },
      { difficulty: 'extreme' },
      { maxPlayers: 13 },
      { unknownSetting: 1 },
      { language: 'fr' },
    ];
    for (const patch of invalid) {
      h.dispatch({ type: 'updateSettings', participantId: mara.id, patch });
    }
    expect(h.state.settings).toEqual(before);
    expect(h.errors(mara)).toEqual(invalid.map(() => 'invalid_settings'));
  });

  it('maxPlayers cannot drop below the number of seated players', () => {
    const h = createHarness();
    const mara = h.join('Mara');
    h.join('Noa');
    h.join('Ole');
    h.dispatch({ type: 'updateSettings', participantId: mara.id, patch: { maxPlayers: 2 } });
    expect(h.state.settings.maxPlayers).toBe(8);
  });

  it('AC-001-09: starting with fewer than two connected players is rejected', () => {
    const h = createHarness();
    const mara = h.join('Mara');
    h.join('Watcher', { role: 'spectator' });
    h.start(mara);
    expect(h.errors(mara)).toEqual(['not_enough_players']);
    expect(h.state.phase).toBe('lobby');

    const noa = h.join('Noa');
    h.disconnect(noa);
    h.start(mara);
    expect(h.state.phase).toBe('lobby');
  });

  it('AC-001-10: only the host can start the game', () => {
    const h = createHarness();
    h.join('Mara');
    const noa = h.join('Noa');
    h.start(noa);
    expect(h.errors(noa)).toEqual(['not_allowed']);
    expect(h.state.phase).toBe('lobby');
  });

  it('AC-001-11: a kicked participant is removed, notified and banned by clientId', () => {
    const h = createHarness();
    const mara = h.join('Mara');
    const noa = h.join('Noa', { clientId: 'noa-browser' });
    h.dispatch({ type: 'kick', participantId: mara.id, targetId: noa.id });

    expect(h.received(noa, 'kicked')).toHaveLength(1);
    expect(h.closed).toContain(noa.conn);
    expect(h.view(mara).participants.map((p) => p.id)).toEqual([mara.id]);

    const again = h.join('Noa', { clientId: 'noa-browser' });
    expect(h.errors(again.conn)).toEqual(['kicked']);
    expect(h.state.seats).toHaveLength(1);
  });

  it('AC-001-12: non-hosts cannot kick and the host cannot be kicked', () => {
    const h = createHarness();
    const mara = h.join('Mara');
    const noa = h.join('Noa');
    const ole = h.join('Ole');
    h.dispatch({ type: 'kick', participantId: noa.id, targetId: ole.id });
    h.dispatch({ type: 'kick', participantId: mara.id, targetId: mara.id });
    expect(h.errors(noa)).toEqual(['not_allowed']);
    expect(h.errors(mara)).toEqual(['not_allowed']);
    expect(h.state.seats).toHaveLength(3);
  });

  it('AC-001-13: play again returns to the lobby with scores reset and settings kept', () => {
    const { h, players } = startedGame(2, { settings: { rounds: 1, drawTime: 30 } });
    const [host, guest] = players as [(typeof players)[0], (typeof players)[0]];
    const word = h.choose();
    h.chat(guest, word);
    h.advance(6_000);
    h.chat(host, h.choose());
    h.advance(6_000);
    expect(h.state.phase).toBe('gameEnd');
    expect(h.state.seats.some((seat) => seat.score > 0)).toBe(true);

    h.dispatch({ type: 'playAgain', participantId: guest.id });
    expect(h.state.phase).toBe('gameEnd');
    h.dispatch({ type: 'playAgain', participantId: host.id });
    expect(h.state.phase).toBe('lobby');
    expect(h.state.seats.map((seat) => seat.score)).toEqual([0, 0]);
    expect(h.state.seats).toHaveLength(2);
    expect(h.state.settings).toMatchObject({ rounds: 1, drawTime: 30 });
  });

  it('a room without connected participants is disposed after five minutes', () => {
    const h = createHarness();
    const mara = h.join('Mara');
    h.disconnect(mara);
    h.advance(4 * 60_000 + 59_000);
    expect(h.disposed).toBe(false);
    h.advance(1_000);
    expect(h.disposed).toBe(true);
  });
});
