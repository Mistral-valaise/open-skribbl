import { reduce, type RoomEvent } from '../game/reduce.js';
import { createRoomState, type RoomState } from '../game/state.js';
import { viewFor } from '../game/view.js';
import {
  defaultSettings,
  type Role,
  type RoomView,
  type ServerMessage,
  type Settings,
} from '../protocol.js';

/** Test harness: drives the reducer like the server runtime does, with a fake clock. */

export interface Participant {
  id: string;
  conn: string;
  token: string;
}

export const DEFAULT_WORDS = ['apple', 'banana', 'cherry', 'dolphin', 'eagle', 'forest', 'guitar'];

/** Small deterministic generator so tests are reproducible. */
export function seededRandom(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HarnessOptions {
  settings?: Partial<Settings>;
  words?: readonly string[];
  seed?: number;
}

export function createHarness(options: HarnessOptions = {}) {
  const words = options.words ?? DEFAULT_WORDS;
  const random = seededRandom(options.seed);
  let state: RoomState = createRoomState('ABCDEF', { ...defaultSettings(), ...options.settings });
  let now = 1_000_000;
  let counter = 0;
  let disposed = false;
  const timers = new Map<string, number>();
  const inbox = new Map<string, ServerMessage[]>();
  const closed: string[] = [];

  const deliver = (conn: string, message: ServerMessage) => {
    if (!inbox.has(conn)) inbox.set(conn, []);
    inbox.get(conn)!.push(message);
  };

  function dispatch(event: RoomEvent): void {
    const result = reduce(state, event, { now, random, words: () => words });
    state = result.state;
    for (const effect of result.effects) {
      if (effect.type === 'send') effect.conns.forEach((conn) => deliver(conn, effect.message));
      else if (effect.type === 'broadcastState') {
        for (const seat of state.seats) {
          if (seat.connId) {
            deliver(seat.connId, { type: 'room.state', state: viewFor(state, seat.id, now) });
          }
        }
      } else if (effect.type === 'setTimer') timers.set(effect.key, effect.at);
      else if (effect.type === 'clearTimer') timers.delete(effect.key);
      else if (effect.type === 'close') closed.push(effect.connId);
      else if (effect.type === 'dispose') disposed = true;
    }
  }

  /** Moves the clock, firing due timers in order. */
  function advance(ms: number): void {
    const target = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, at]) => at <= target)
        .sort((a, b) => a[1] - b[1])[0];
      if (!due) break;
      timers.delete(due[0]);
      now = Math.max(now, due[1]);
      dispatch({ type: 'timer', key: due[0] });
    }
    now = target;
  }

  function join(
    nickname: string,
    extra: { role?: Role; clientId?: string; sessionToken?: string; avatar?: unknown } = {},
  ): Participant {
    counter += 1;
    const conn = `conn${counter}`;
    dispatch({
      type: 'join',
      connId: conn,
      newId: `p${counter}`,
      newToken: `token${counter}`,
      nickname,
      avatar: extra.avatar ?? { body: 0, eyes: 0, mouth: 0, accessory: 0 },
      role: extra.role ?? 'player',
      clientId: extra.clientId ?? `client-${counter}`,
      sessionToken: extra.sessionToken,
    });
    const seat = state.seats.find((candidate) => candidate.connId === conn);
    return { id: seat?.id ?? '', conn, token: seat?.token ?? '' };
  }

  const messages = (participant: Participant | string) =>
    inbox.get(typeof participant === 'string' ? participant : participant.conn) ?? [];

  return {
    get state() {
      return state;
    },
    get now() {
      return now;
    },
    get disposed() {
      return disposed;
    },
    timers,
    closed,
    dispatch,
    advance,
    join,
    messages,
    /** Messages of one type received by a participant. */
    received<T extends ServerMessage['type']>(participant: Participant | string, type: T) {
      return messages(participant).filter(
        (message): message is Extract<ServerMessage, { type: T }> => message.type === type,
      );
    },
    errors: (participant: Participant | string) =>
      messages(participant).flatMap((message) => (message.type === 'error' ? [message.code] : [])),
    clearInbox: () => inbox.clear(),
    view: (participant: Participant): RoomView => viewFor(state, participant.id, now),
    disconnect: (participant: Participant) =>
      dispatch({ type: 'disconnect', connId: participant.conn }),
    start: (host: Participant) => dispatch({ type: 'startGame', participantId: host.id }),
    chat: (participant: Participant, text: string) =>
      dispatch({ type: 'chat', participantId: participant.id, text }),
    /** The drawer picks the given word (or the first choice). */
    choose(word?: string): string {
      const turn = state.turn!;
      const index = word === undefined ? 0 : turn.choices.indexOf(word);
      if (index < 0) throw new Error(`"${word}" was not offered: ${turn.choices.join(', ')}`);
      dispatch({ type: 'chooseWord', participantId: turn.drawerId, index });
      return turn.choices[index]!;
    },
  };
}

export type Harness = ReturnType<typeof createHarness>;

/** A started game with `count` players, in the choosing phase of turn 1. */
export function startedGame(count: number, options: HarnessOptions = {}) {
  const h = createHarness(options);
  const players = Array.from({ length: count }, (_, index) => h.join(`Player${index + 1}`));
  h.start(players[0]!);
  return { h, players };
}
