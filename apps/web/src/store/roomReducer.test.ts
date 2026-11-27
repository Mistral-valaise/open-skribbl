import {
  defaultSettings,
  type ChatMessage,
  type DrawOp,
  type Phase,
  type RoomView,
  type ServerMessage,
} from '@kritzel/shared';
import { describe, expect, it } from 'vitest';
import { INITIAL_ROOM_DATA, reduceServerMessage, type RoomData } from './roomReducer.js';

const NOW = 50_000;

function view(phase: Phase, patch: Partial<RoomView> = {}): RoomView {
  return {
    code: 'ABC234',
    phase,
    hostId: 'p1',
    you: { id: 'p2', role: 'player', like: null },
    settings: defaultSettings(),
    customWordCount: 0,
    participants: [],
    round: 1,
    totalRounds: 3,
    drawerId: 'p1',
    mask: null,
    word: null,
    phaseEndsAt: null,
    serverNow: NOW,
    turnEnd: null,
    results: null,
    ...patch,
  };
}

function reduceAll(messages: ServerMessage[], start: RoomData = INITIAL_ROOM_DATA): RoomData {
  return messages.reduce((data, message) => reduceServerMessage(data, message, NOW).data, start);
}

const draw = (op: DrawOp): ServerMessage => ({ type: 'draw.op', op });
const stroke: ServerMessage[] = [
  draw({ type: 'stroke.start', id: 's1', tool: 'brush', color: '#14151C', size: 8, x: 10, y: 10 }),
  draw({ type: 'stroke.points', id: 's1', points: [20, 20, 30, 30] }),
  draw({ type: 'stroke.end', id: 's1' }),
];

describe('reduceServerMessage', () => {
  it('AC-003-08: joining during a turn starts from the drawing sent in `joined`', () => {
    const data = reduceAll([
      {
        type: 'joined',
        participantId: 'p2',
        sessionToken: 'token',
        state: view('drawing'),
        items: [
          {
            kind: 'stroke',
            id: 'a',
            tool: 'brush',
            color: '#14151C',
            size: 8,
            points: [1, 2, 3, 4],
            done: true,
          },
          { kind: 'fill', x: 5, y: 5, color: '#E5383B' },
        ],
        redo: [{ kind: 'clear' }],
      },
    ]);
    expect(data.status).toBe('joined');
    expect(data.opLog.items).toHaveLength(2);
    expect(data.opLog.redo).toEqual([{ kind: 'clear' }]);
    expect(data.opLog.pointCount).toBe(2);
  });

  it('AC-003-01: relayed ops of the drawer extend the op log', () => {
    const data = reduceAll([{ type: 'room.state', state: view('drawing') }, ...stroke]);
    expect(data.opLog.items).toEqual([
      expect.objectContaining({
        kind: 'stroke',
        id: 's1',
        points: [10, 10, 20, 20, 30, 30],
        done: true,
      }),
    ]);
  });

  it('AC-003-17: the op log is empty again when the next turn starts', () => {
    const drawn = reduceAll([{ type: 'room.state', state: view('drawing') }, ...stroke]);
    const turnEnd = reduceAll([{ type: 'room.state', state: view('turnEnd') }], drawn);
    expect(turnEnd.opLog.items).toHaveLength(1);
    const next = reduceAll([{ type: 'room.state', state: view('choosing') }], turnEnd);
    expect(next.opLog.items).toHaveLength(0);
  });

  it('AC-002-02: word choices stay for the choosing phase and are dropped afterwards', () => {
    // The server sends the choices just before the snapshot that starts the phase.
    const choosing = reduceAll([
      { type: 'room.state', state: view('turnEnd') },
      { type: 'word.choices', words: ['sun', 'moon', 'star'] },
      { type: 'room.state', state: view('choosing') },
    ]);
    expect(choosing.wordChoices).toEqual(['sun', 'moon', 'star']);
    const drawing = reduceAll([{ type: 'room.state', state: view('drawing') }], choosing);
    expect(drawing.wordChoices).toBeNull();
  });

  it('AC-002-16: every snapshot updates the clock offset from `serverNow`', () => {
    const data = reduceAll([
      { type: 'room.state', state: view('lobby', { serverNow: NOW + 30_000 }) },
    ]);
    expect(data.clockOffset).toBe(30_000);
  });

  it('AC-004-08: close and correct feedback become private lines of the chat log', () => {
    const chat: ChatMessage = {
      type: 'chat.message',
      id: 1,
      kind: 'chat',
      channel: 'all',
      from: 'p2',
      name: 'Mara',
      text: 'hose',
    };
    const data = reduceAll([
      chat,
      { type: 'guess.feedback', kind: 'close', text: 'hose' },
      { type: 'guess.feedback', kind: 'correct', text: 'house' },
    ]);
    expect(data.chat.map((line) => line.entry)).toEqual(['message', 'close', 'correct']);
    expect(data.chat[1]).toMatchObject({ entry: 'close', text: 'hose' });
    expect(data.chat[2]).toMatchObject({ entry: 'correct', word: 'house' });
    expect(new Set(data.chat.map((line) => line.key)).size).toBe(3);
  });

  it('AC-001-11: `kicked` and join errors end the session with a failure', () => {
    expect(reduceAll([{ type: 'kicked' }])).toMatchObject({ status: 'failed', failure: 'kicked' });
    expect(reduceAll([{ type: 'error', code: 'room_full' }])).toMatchObject({
      status: 'failed',
      failure: 'room_full',
    });
  });

  it('AC-008-01: a reaction is shown over the canvas until the drawing phase ends', () => {
    const drawing = reduceAll([
      { type: 'room.state', state: view('drawing') },
      { type: 'reaction', participantId: 'p3', emoji: '🔥' },
      { type: 'reaction', participantId: 'p2', emoji: '👏' },
    ]);
    expect(drawing.reactions.map((reaction) => reaction.emoji)).toEqual(['🔥', '👏']);
    expect(new Set(drawing.reactions.map((reaction) => reaction.key)).size).toBe(2);
    for (const reaction of drawing.reactions) {
      expect(reaction.left).toBeGreaterThanOrEqual(0);
      expect(reaction.left).toBeLessThanOrEqual(100);
    }
    const turnEnd = reduceAll([{ type: 'room.state', state: view('turnEnd') }], drawing);
    expect(turnEnd.reactions).toHaveLength(0);
  });

  it('AC-008-04: the own like lasts for the turn and is forgotten when the next one starts', () => {
    const liked = {
      ...reduceAll([{ type: 'room.state', state: view('drawing') }]),
      myLike: 'up' as const,
    };
    expect(reduceAll([{ type: 'room.state', state: view('turnEnd') }], liked).myLike).toBe('up');
    expect(reduceAll([{ type: 'room.state', state: view('choosing') }], liked).myLike).toBeNull();
  });

  it('AC-008-08: a drawing fetched at game end is kept by turn index', () => {
    const items = [{ kind: 'fill', x: 5, y: 5, color: '#E5383B' }] as const;
    const data = reduceAll([
      { type: 'room.state', state: view('gameEnd') },
      { type: 'gallery.drawing', turnIndex: 2, items },
    ]);
    expect(data.gallery).toEqual({ 2: items });
  });

  it('AC-008-13: the drawings of a game are dropped when the room returns to the lobby', () => {
    const data = reduceAll([
      { type: 'room.state', state: view('gameEnd') },
      { type: 'gallery.drawing', turnIndex: 0, items: [] },
      { type: 'room.state', state: view('lobby') },
      // A late answer to a request from the finished game.
      { type: 'gallery.drawing', turnIndex: 1, items: [] },
    ]);
    expect(data.gallery).toEqual({});
  });

  it('reports other error codes without changing the room', () => {
    const result = reduceServerMessage(
      INITIAL_ROOM_DATA,
      { type: 'error', code: 'rate_limited' },
      NOW,
    );
    expect(result.error).toBe('rate_limited');
    expect(result.data).toBe(INITIAL_ROOM_DATA);
  });
});
