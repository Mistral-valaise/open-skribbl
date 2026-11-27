import {
  applyOp,
  CHAT_MAX_LENGTH,
  MIN_PLAYERS_TO_START,
  PROTOCOL_VERSION,
  type ClientMessage,
  type DrawOp,
  type LikeValue,
  type Role,
  type ServerMessage,
} from '@kritzel/shared';
import { RoomConnection, webSocketUrl } from '../connection/roomConnection.js';
import {
  clearSession,
  loadAvatar,
  loadClientId,
  loadSession,
  rerollAvatar,
  saveSession,
} from './identity.js';
import { INITIAL_ROOM_DATA, reduceServerMessage, type JoinFailure } from './roomReducer.js';
import { useRoomStore } from './roomStore.js';
import { showToast } from './toastStore.js';

/**
 * The link between the connection, the store and the browser's storage: joins
 * and leaves rooms, feeds server messages into the store and sends intents.
 */

interface ActiveRoom {
  code: string;
  connection: RoomConnection;
}

let active: ActiveRoom | null = null;

/** After these failures the stored seat is useless and is forgotten. */
const FORGET_SEAT: readonly JoinFailure[] = ['kicked', 'room_not_found', 'invalid_nickname'];

function receive(room: ActiveRoom, message: ServerMessage): void {
  if (active !== room) return;
  const before = useRoomStore.getState();
  const { data, error } = reduceServerMessage(before, message, Date.now());
  useRoomStore.setState(data, true);

  if (message.type === 'joined') {
    saveSession(room.code, { token: message.sessionToken, role: message.state.you.role });
    room.connection.confirmJoined();
  }
  if (data.failure && data.failure !== before.failure) {
    room.connection.stop();
    if (FORGET_SEAT.includes(data.failure)) clearSession(room.code);
    if (data.failure === 'invalid_avatar') rerollAvatar();
  }
  if (error) showToast(`error.${error}`, { max: CHAT_MAX_LENGTH, min: MIN_PLAYERS_TO_START });
}

export interface JoinParams {
  code: string;
  nickname: string;
  role: Role;
}

/** Opens the connection to a room; a stored session token resumes the seat (spec 007). */
export function joinRoom({ code, nickname, role }: JoinParams): void {
  disconnect();
  const room: ActiveRoom = {
    code,
    connection: new RoomConnection({
      url: webSocketUrl(window.location),
      buildJoin: () => {
        const stored = loadSession(code);
        return {
          type: 'join',
          protocolVersion: PROTOCOL_VERSION,
          roomCode: code,
          nickname,
          avatar: loadAvatar(),
          role: stored?.role ?? role,
          clientId: loadClientId(),
          sessionToken: stored?.token,
        };
      },
      onMessage: (message) => receive(room, message),
      onLost: () => {
        if (active === room) useRoomStore.setState({ status: 'reconnecting' });
      },
    }),
  };
  active = room;
  useRoomStore.setState({ ...INITIAL_ROOM_DATA, status: 'connecting' }, true);
  room.connection.start();
}

/** Closes the connection but keeps the seat, so coming back resumes it. */
export function disconnect(): void {
  active?.connection.stop();
  active = null;
  useRoomStore.setState(INITIAL_ROOM_DATA, true);
}

/** Gives up the seat for good. */
export function leaveRoom(): void {
  if (active) {
    active.connection.send({ type: 'leave' });
    clearSession(active.code);
  }
  disconnect();
}

export function send(message: ClientMessage): boolean {
  return active?.connection.send(message) ?? false;
}

/** Applies an op to the local op log only; false when the op log rejects it. */
export function applyLocalOp(op: DrawOp): boolean {
  const result = applyOp(useRoomStore.getState().opLog, op);
  if (!result.ok) {
    if (result.code === 'drawing_limit') showToast('error.drawing_limit');
    return false;
  }
  useRoomStore.setState({ opLog: result.log });
  return true;
}

/** The drawer's op: drawn at once on the own canvas, then sent to the server. */
export function drawOp(op: DrawOp): boolean {
  if (!applyLocalOp(op)) return false;
  send({ type: 'draw.op', op });
  return true;
}

/** Sets this participant's like for the current drawing; sending again replaces it (spec 008). */
export function setLike(value: LikeValue): void {
  if (send({ type: 'like.set', value })) useRoomStore.setState({ myLike: value });
}

/** Removes a reaction from over the canvas once it has floated away. */
export function dismissReaction(key: string): void {
  useRoomStore.setState((state) => ({
    reactions: state.reactions.filter((reaction) => reaction.key !== key),
  }));
}

/** A room created on the home screen is joined without showing the join form. */
let autoJoinCode: string | null = null;

export function requestAutoJoin(code: string): void {
  autoJoinCode = code;
}

export function hasAutoJoin(code: string): boolean {
  return autoJoinCode === code;
}

export function clearAutoJoin(): void {
  autoJoinCode = null;
}
