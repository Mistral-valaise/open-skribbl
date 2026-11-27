import { randomBytes, randomUUID } from 'node:crypto';
import {
  clientMessageSchema,
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
  RATE_LIMITS,
  type ClientMessage,
  type ErrorCode,
  type RoomEvent,
  type ServerMessage,
} from '@kritzel/shared';
import type { WebSocket } from 'ws';
import type { Logger } from './app.js';
import type { Clock } from './clock.js';
import { TokenBucket, WindowCounter } from './rateLimit.js';
import type { RoomRegistry } from './rooms/registry.js';
import type { Room } from './rooms/room.js';

/**
 * One WebSocket connection: parses, validates and rate-limits inbound
 * messages and turns them into room events (docs/ARCHITECTURE.md §4).
 */
export function handleConnection(
  socket: WebSocket,
  registry: RoomRegistry,
  clock: Clock,
  log: Logger = () => undefined,
): void {
  const connId = randomUUID();
  const drawBucket = new TokenBucket(
    RATE_LIMITS.draw.burst,
    RATE_LIMITS.draw.perSecond,
    clock.now(),
  );
  const chatBucket = new TokenBucket(
    RATE_LIMITS.chat.burst,
    RATE_LIMITS.chat.perSecond,
    clock.now(),
  );
  const drops = new WindowCounter(RATE_LIMITS.dropWindowMs);
  let room: Room | undefined;

  const send = (message: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };
  const drop = (code: ErrorCode) => {
    log('debug', 'message rejected', { code, room: room?.code });
    send({ type: 'error', code });
    if (drops.add(clock.now()) >= RATE_LIMITS.dropsToClose)
      socket.close(1008, 'too many rejected messages');
  };
  const refuse = (code: ErrorCode) => {
    send({ type: 'error', code });
    socket.close(1008, code);
  };

  socket.on('message', (data, isBinary) => {
    const raw = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
    if (isBinary || raw.byteLength > MAX_FRAME_BYTES) return drop('bad_request');

    let message: ClientMessage;
    try {
      message = clientMessageSchema.parse(JSON.parse(raw.toString('utf8')));
    } catch {
      return drop('bad_request');
    }

    if (message.type === 'join') {
      if (room) return drop('bad_request');
      if (message.protocolVersion !== PROTOCOL_VERSION) return refuse('version_mismatch');
      const target = registry.get(message.roomCode);
      if (!target) return refuse('room_not_found');
      room = target;
      room.attach({ id: connId, send, close: () => socket.close(1000) });
      log('info', 'participant connecting', { room: room.code, seats: room.state.seats.length });
      room.dispatch({
        type: 'join',
        connId,
        newId: randomBytes(6).toString('base64url'),
        newToken: randomBytes(16).toString('base64url'),
        nickname: message.nickname,
        avatar: message.avatar,
        role: message.role,
        clientId: message.clientId,
        sessionToken: message.sessionToken,
      });
      return;
    }

    const participantId = room?.participantOf(connId);
    if (!room || !participantId) return drop('bad_request');

    if (message.type === 'draw.op' && !drawBucket.take(clock.now())) return drop('rate_limited');
    if (message.type === 'chat.send' && !chatBucket.take(clock.now())) return drop('rate_limited');

    room.dispatch(toEvent(message, participantId));
  });

  socket.on('close', () => room?.detach(connId));
  socket.on('error', () => socket.terminate());
}

function toEvent(
  message: Exclude<ClientMessage, { type: 'join' }>,
  participantId: string,
): RoomEvent {
  switch (message.type) {
    case 'leave':
      return { type: 'leave', participantId };
    case 'settings.update':
      return { type: 'updateSettings', participantId, patch: message.settings };
    case 'game.start':
      return { type: 'startGame', participantId };
    case 'game.playAgain':
      return { type: 'playAgain', participantId };
    case 'player.kick':
      return { type: 'kick', participantId, targetId: message.playerId };
    case 'word.choose':
      return { type: 'chooseWord', participantId, index: message.index };
    case 'draw.op':
      return { type: 'drawOp', participantId, op: message.op };
    case 'chat.send':
      return { type: 'chat', participantId, text: message.text };
    case 'reaction.send':
      return { type: 'reaction', participantId, emoji: message.emoji };
    case 'like.set':
      return { type: 'like', participantId, value: message.value };
    case 'gallery.get':
      return { type: 'galleryGet', participantId, turnIndex: message.turnIndex };
  }
}
