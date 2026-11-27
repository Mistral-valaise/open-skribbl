import {
  applyOp,
  EMPTY_OP_LOG,
  type ChatMessage,
  type DrawItem,
  type ErrorCode,
  type OpLog,
  type RoomView,
  type ServerMessage,
} from '@kritzel/shared';
import { offsetFrom } from '../connection/clock.js';

/** Reasons a room cannot be used any more; the connection stops retrying on these. */
export const JOIN_FAILURES = [
  'room_full',
  'kicked',
  'invalid_nickname',
  'invalid_avatar',
  'version_mismatch',
  'room_not_found',
  'replaced',
  'shutdown',
] as const;
export type JoinFailure = (typeof JOIN_FAILURES)[number];

export function isJoinFailure(code: string): code is JoinFailure {
  return (JOIN_FAILURES as readonly string[]).includes(code);
}

/** One line of the chat log: a relayed message or a private notice about the own guess. */
export type ChatEntry =
  | { entry: 'message'; key: string; message: ChatMessage }
  | { entry: 'close'; key: string; text: string }
  | { entry: 'correct'; key: string; word: string };

export type ConnectionStatus = 'idle' | 'connecting' | 'joined' | 'reconnecting' | 'failed';

export interface RoomData {
  status: ConnectionStatus;
  failure: JoinFailure | null;
  /** The latest snapshot; everything the screens show about the room comes from here. */
  view: RoomView | null;
  /** Server clock minus local clock, measured on every snapshot. */
  clockOffset: number;
  chat: readonly ChatEntry[];
  chatSeq: number;
  /** The current turn's drawing, including the drawer's own optimistic ops. */
  opLog: OpLog;
  /** Word choices offered to this participant as the drawer. */
  wordChoices: readonly string[] | null;
}

export const INITIAL_ROOM_DATA: RoomData = {
  status: 'idle',
  failure: null,
  view: null,
  clockOffset: 0,
  chat: [],
  chatSeq: 0,
  opLog: EMPTY_OP_LOG,
  wordChoices: null,
};

const CHAT_LOG_LIMIT = 200;

export function opLogFromItems(items: readonly DrawItem[]): OpLog {
  const pointCount = items.reduce(
    (sum, item) => sum + (item.kind === 'stroke' ? item.points.length / 2 : 0),
    0,
  );
  return { items, redo: [], pointCount };
}

function withSnapshot(data: RoomData, view: RoomView, localNow: number): RoomData {
  // The canvas is empty at the start of each turn and in the lobby (spec 002, spec 003).
  const blank = view.phase === 'choosing' || view.phase === 'lobby';
  return {
    ...data,
    view,
    clockOffset: offsetFrom(view.serverNow, localNow),
    opLog: blank ? EMPTY_OP_LOG : data.opLog,
    wordChoices: view.phase === 'choosing' ? data.wordChoices : null,
  };
}

/** `Omit` applied to each member of a union. */
type Keyless<Entry> = Entry extends unknown ? Omit<Entry, 'key'> : never;

function withChatEntry(data: RoomData, entry: Keyless<ChatEntry>): RoomData {
  const keyed = { ...entry, key: `c${data.chatSeq}` } as ChatEntry;
  return {
    ...data,
    chatSeq: data.chatSeq + 1,
    chat: [...data.chat, keyed].slice(-CHAT_LOG_LIMIT),
  };
}

function failed(data: RoomData, failure: JoinFailure): RoomData {
  return { ...data, status: 'failed', failure };
}

export interface ReduceResult {
  data: RoomData;
  /** A rejected intent the participant should be told about. */
  error?: ErrorCode;
}

/** Folds one server message into the client's picture of the room. */
export function reduceServerMessage(
  data: RoomData,
  message: ServerMessage,
  localNow: number,
): ReduceResult {
  switch (message.type) {
    case 'joined':
      return {
        data: {
          ...withSnapshot(data, message.state, localNow),
          status: 'joined',
          failure: null,
          opLog: opLogFromItems(message.items),
        },
      };
    case 'room.state':
      return { data: withSnapshot(data, message.state, localNow) };
    case 'word.choices':
      return { data: { ...data, wordChoices: message.words } };
    case 'draw.op': {
      const result = applyOp(data.opLog, message.op);
      return { data: result.ok ? { ...data, opLog: result.log } : data };
    }
    case 'chat.message':
      return { data: withChatEntry(data, { entry: 'message', message }) };
    case 'guess.feedback':
      return {
        data:
          message.kind === 'close'
            ? withChatEntry(data, { entry: 'close', text: message.text })
            : withChatEntry(data, { entry: 'correct', word: message.text }),
      };
    case 'kicked':
      return { data: failed(data, 'kicked') };
    case 'server.shutdown':
      return { data: failed(data, 'shutdown') };
    case 'error':
      return isJoinFailure(message.code)
        ? { data: failed(data, message.code) }
        : { data, error: message.code };
    default:
      // A message type this client does not know yet.
      return { data };
  }
}
