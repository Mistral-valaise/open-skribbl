import { describe, expect, it } from 'vitest';
import type { DrawOp } from '../drawing.js';
import { createHarness, startedGame, type Participant } from '../testing/harness.js';

const start: DrawOp = {
  type: 'stroke.start',
  id: 's1',
  tool: 'brush',
  color: '#14151C',
  size: 8,
  x: 10,
  y: 10,
};
const points: DrawOp = { type: 'stroke.points', id: 's1', points: [20, 20, 30, 30] };

describe('drawing in a room (spec 003)', () => {
  it("AC-003-01: the drawer's ops are relayed to everyone else and logged", () => {
    const { h, players } = startedGame(3);
    const [drawer, a, b] = players as Participant[];
    h.choose();
    h.dispatch({ type: 'drawOp', participantId: drawer!.id, op: start });
    h.dispatch({ type: 'drawOp', participantId: drawer!.id, op: points });

    expect(h.received(a!, 'draw.op').map((m) => m.op)).toEqual([start, points]);
    expect(h.received(b!, 'draw.op')).toHaveLength(2);
    expect(h.received(drawer!, 'draw.op')).toHaveLength(0);
    expect(h.state.turn!.opLog.items).toMatchObject([
      { kind: 'stroke', points: [10, 10, 20, 20, 30, 30] },
    ]);
  });

  it('AC-003-02: ops from others or outside the drawing phase are refused', () => {
    const { h, players } = startedGame(3);
    const [drawer, other] = players as Participant[];
    h.dispatch({ type: 'drawOp', participantId: drawer!.id, op: start });
    expect(h.errors(drawer!)).toEqual(['not_allowed']);

    h.choose();
    h.dispatch({ type: 'drawOp', participantId: other!.id, op: start });
    expect(h.errors(other!)).toEqual(['not_allowed']);
    expect(h.state.turn!.opLog.items).toEqual([]);
    expect(h.received(players[2]!, 'draw.op')).toHaveLength(0);
  });

  it('AC-003-08: a participant joining during drawing receives the current items', () => {
    const { h, players } = startedGame(2);
    h.choose();
    h.dispatch({ type: 'drawOp', participantId: players[0]!.id, op: start });
    h.dispatch({ type: 'drawOp', participantId: players[0]!.id, op: points });

    const late = h.join('Late', { role: 'spectator' });
    expect(h.received(late, 'joined')[0]!.items).toEqual(h.state.turn!.opLog.items);
    expect(h.received(late, 'joined')[0]!.items).toHaveLength(1);
  });

  it('a drawer who resumes mid-turn receives the redo stack as well', () => {
    const { h, players } = startedGame(2);
    const drawer = players[0]!;
    h.choose();
    h.dispatch({ type: 'drawOp', participantId: drawer.id, op: start });
    h.dispatch({ type: 'drawOp', participantId: drawer.id, op: { type: 'stroke.end', id: 's1' } });
    h.dispatch({ type: 'drawOp', participantId: drawer.id, op: { type: 'undo' } });
    h.disconnect(drawer);
    const back = h.join('ignored', { sessionToken: drawer.token });
    const joined = h.received(back, 'joined')[0]!;
    expect(joined.items).toEqual([]);
    expect(joined.redo).toMatchObject([{ kind: 'stroke', id: 's1' }]);
  });

  it('AC-003-09: an unfinished stroke is stored as finished when the turn ends', () => {
    const { h, players } = startedGame(2, { settings: { drawTime: 30 } });
    h.choose();
    h.dispatch({ type: 'drawOp', participantId: players[0]!.id, op: start });
    h.advance(30_000);
    expect(h.state.game!.turns[0]!.items).toMatchObject([{ kind: 'stroke', id: 's1', done: true }]);
  });

  it('AC-003-10: an op beyond the limits is answered with drawing_limit', () => {
    const { h, players } = startedGame(2);
    const drawer = players[0]!;
    h.choose();
    h.dispatch({ type: 'drawOp', participantId: drawer.id, op: start });
    const many = Array.from({ length: 4_999 }, () => [5, 5]).flat();
    h.dispatch({ type: 'drawOp', participantId: drawer.id, op: { ...points, points: many } });
    h.dispatch({ type: 'drawOp', participantId: drawer.id, op: points });
    expect(h.errors(drawer)).toEqual(['drawing_limit']);
  });

  it('AC-003-17: every turn starts with an empty op log', () => {
    const { h, players } = startedGame(2, { settings: { drawTime: 30 } });
    h.choose();
    h.dispatch({ type: 'drawOp', participantId: players[0]!.id, op: start });
    h.advance(36_000);
    h.choose();
    expect(h.state.phase).toBe('drawing');
    expect(h.state.turn!.opLog.items).toEqual([]);
    const lobby = createHarness();
    expect(lobby.state.turn).toBeNull();
  });
});
