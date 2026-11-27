import type { DrawItem, OpLog } from '../drawing.js';
import type { Avatar } from '../identity.js';
import type { LikeValue, Phase, Role, Settings, TurnEndReason } from '../protocol.js';

/**
 * Complete state of one room. Owned by the server runtime, changed only by
 * `reduce`. Nested arrays and objects are treated as immutable.
 */
export interface Seat {
  id: string;
  /** Browser identity, used for kick bans only. */
  clientId: string;
  /** Secret that resumes the seat. */
  token: string;
  /** Opaque handle of the open connection; null while disconnected. */
  connId: string | null;
  nickname: string;
  avatar: Avatar;
  role: Role;
  joinedSeq: number;
  score: number;
  waiting: boolean;
  /** Time of the last reaction this seat sent, for the cooldown. */
  lastReactionAt: number;
}

export interface Turn {
  drawerId: string;
  choices: readonly string[];
  /** Null during choosing. */
  word: string | null;
  /** Revealed mask positions (hints). */
  revealed: readonly number[];
  hintsTotal: number;
  /** Guessers of the turn, fixed when drawing starts. */
  guesserIds: readonly string[];
  /** Points earned by each player who guessed, bonus included. */
  guessed: Readonly<Record<string, number>>;
  startedAt: number;
  endsAt: number;
  opLog: OpLog;
  /** One like per guesser of the turn. */
  likes: Readonly<Record<string, LikeValue>>;
  /** Index of this turn in `game.turns` once it is completed. */
  completedIndex: number | null;
  end: { reason: TurnEndReason; deltas: Readonly<Record<string, number>> } | null;
}

export interface CompletedTurn {
  round: number;
  drawerId: string;
  drawerName: string;
  /** Null when the drawer had already left when the turn ended. */
  drawerAvatar: Avatar | null;
  word: string;
  items: readonly DrawItem[];
  guessedCount: number;
  guesserCount: number;
  likesUp: number;
  likesDown: number;
}

export interface LeftPlayer {
  id: string;
  nickname: string;
  avatar: Avatar;
  score: number;
  joinedSeq: number;
}

export interface Game {
  round: number;
  /** Seat ids in drawing order for the current round. */
  order: readonly string[];
  orderIndex: number;
  /** `wordKey`s of words already offered. */
  usedWords: readonly string[];
  turns: readonly CompletedTurn[];
  leftPlayers: readonly LeftPlayer[];
  endAfterTurn: boolean;
}

export interface RoomState {
  code: string;
  phase: Phase;
  hostId: string | null;
  settings: Settings;
  seats: Seat[];
  bannedClientIds: string[];
  nextSeq: number;
  nextChatId: number;
  game: Game | null;
  turn: Turn | null;
  phaseEndsAt: number | null;
}

export function createRoomState(code: string, settings: Settings): RoomState {
  return {
    code,
    phase: 'lobby',
    hostId: null,
    settings,
    seats: [],
    bannedClientIds: [],
    nextSeq: 0,
    nextChatId: 1,
    game: null,
    turn: null,
    phaseEndsAt: null,
  };
}

/** Copies everything `reduce` mutates; immutable nested data is shared. */
export function cloneRoomState(state: RoomState): RoomState {
  return {
    ...state,
    seats: state.seats.map((seat) => ({ ...seat })),
    bannedClientIds: [...state.bannedClientIds],
    game: state.game ? { ...state.game } : null,
    turn: state.turn ? { ...state.turn } : null,
  };
}

export const isPlayer = (seat: Seat) => seat.role === 'player';
export const isConnected = (seat: Seat) => seat.connId !== null;
export const connectedPlayers = (state: RoomState) =>
  state.seats.filter((seat) => isPlayer(seat) && isConnected(seat));
