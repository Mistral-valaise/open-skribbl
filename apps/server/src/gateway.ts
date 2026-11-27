import { randomBytes, randomUUID } from 'node:crypto';
import {
  clientMessageSchema,
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
  RATE_LIMITS,
  type ClientMessage,
  type ErrorCode,
  type JoinMessage,
  type RoomEvent,
  type ServerMessage,
} from '@kritzel/shared';
import { SpanKind } from '@opentelemetry/api';
import type { WebSocket } from 'ws';
import type { Logger } from './app.js';
import type { Clock } from './clock.js';
import { TokenBucket, WindowCounter } from './rateLimit.js';
import type { RoomRegistry } from './rooms/registry.js';
import type { Room } from './rooms/room.js';
import {
  bounded,
  DRAW_SPAN_SAMPLE_EVERY,
  EXCLUDED_JOIN_REASONS,
  spanNameForWs,
} from './telemetry/contract.js';
import type { Signal } from './telemetry/observe.js';
import { noopTelemetry, type Telemetry } from './telemetry/telemetry.js';
import { remoteParent } from './telemetry/traceparent.js';

export interface GatewayOptions {
  telemetry?: Telemetry;
  /** Accept a W3C `traceparent` on join (spec 015, "Browser measurements"). */
  acceptTraceparent?: boolean;
}

/** What handling one inbound frame came to. */
interface Handled {
  /** The error code sent back, if the message was refused. */
  code?: ErrorCode;
  signals: readonly Signal[];
}

/**
 * One WebSocket connection: parses, validates and rate-limits inbound
 * messages and turns them into room events (docs/ARCHITECTURE.md §4).
 */
export function handleConnection(
  socket: WebSocket,
  registry: RoomRegistry,
  clock: Clock,
  log: Logger = () => undefined,
  options: GatewayOptions = {},
): void {
  const telemetry = options.telemetry ?? noopTelemetry;
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
  let drawOps = 0;

  const send = (message: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };
  const drop = (code: ErrorCode): Handled => {
    log('debug', 'message rejected', { code, room: room?.code });
    send({ type: 'error', code });
    if (drops.add(clock.now()) >= RATE_LIMITS.dropsToClose)
      socket.close(1008, 'too many rejected messages');
    return { code, signals: [] };
  };
  /** Refuses a join before it reaches a room; the room's observer never sees it. */
  const refuse = (code: ErrorCode, message: JoinMessage, startedAt: number): Handled => {
    send({ type: 'error', code });
    socket.close(1008, code);
    const signals: Signal[] = [
      {
        kind: 'join',
        outcome: 'rejected',
        reason: code,
        role: message.role,
        validity: EXCLUDED_JOIN_REASONS.includes(code) ? 'excluded' : 'valid',
      },
    ];
    telemetry.roomSignals(signals, startedAt);
    return { code, signals };
  };

  const handle = (message: ClientMessage | undefined, startedAt: number): Handled => {
    if (!message) return drop('bad_request');

    if (message.type === 'join') {
      if (room) return drop('bad_request');
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        return refuse('version_mismatch', message, startedAt);
      }
      const target = registry.get(message.roomCode);
      if (!target) return refuse('room_not_found', message, startedAt);
      room = target;
      room.attach({ id: connId, send, close: () => socket.close(1000) });
      log('info', 'participant connecting', { room: room.code, seats: room.state.seats.length });
      const signals = room.dispatch({
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
      const join = signals.find((signal) => signal.kind === 'join');
      return {
        code: join?.outcome === 'rejected' && join.reason !== 'none' ? join.reason : undefined,
        signals,
      };
    }

    const participantId = room?.participantOf(connId);
    if (!room || !participantId) return drop('bad_request');

    if (message.type === 'draw.op' && !drawBucket.take(clock.now())) {
      telemetry.count('rateLimitHits', { 'kritzel.scope': 'draw' });
      return drop('rate_limited');
    }
    if (message.type === 'chat.send' && !chatBucket.take(clock.now())) {
      telemetry.count('rateLimitHits', { 'kritzel.scope': 'chat' });
      return drop('rate_limited');
    }

    const signals = room.dispatch(toEvent(message, participantId));
    return { code: signals.find((signal) => signal.kind === 'rejected')?.code, signals };
  };

  socket.on('message', (data, isBinary) => {
    const startedAt = telemetry.now();
    const raw = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
    let message: ClientMessage | undefined;
    if (!isBinary && raw.byteLength <= MAX_FRAME_BYTES) {
      try {
        message = clientMessageSchema.parse(JSON.parse(raw.toString('utf8')));
      } catch {
        message = undefined;
      }
    }
    if (!telemetry.enabled) {
      handle(message, startedAt);
      return;
    }

    const type = message?.type ?? 'invalid';
    // Drawing is by far the most frequent message; only a sample of it is traced.
    const traced = type !== 'draw.op' || drawOps++ % DRAW_SPAN_SAMPLE_EVERY === 0;
    const labels = { 'kritzel.ws.message.type': type } as const;
    const handled = traced
      ? telemetry.span(
          spanNameForWs(type),
          {
            kind: SpanKind.SERVER,
            labels,
            parent:
              options.acceptTraceparent && message?.type === 'join'
                ? remoteParent(message.traceparent)
                : undefined,
          },
          (span) => {
            const result = handle(message, startedAt);
            if (result.code)
              span.setAttribute('kritzel.reason', bounded('kritzel.reason', result.code));
            return result;
          },
        )
      : handle(message, startedAt);

    const seconds = (telemetry.now() - startedAt) / 1000;
    telemetry.count('wsMessages', {
      ...labels,
      'kritzel.outcome': handled.code ? 'rejected' : 'accepted',
    });
    if (handled.code) {
      telemetry.count('messagesRejected', { ...labels, 'kritzel.reason': handled.code });
    }
    telemetry.record('wsMessageDuration', seconds, labels);
    for (const signal of handled.signals) {
      if (signal.kind === 'join' && signal.outcome !== 'rejected') {
        telemetry.record('joinDuration', seconds, { 'kritzel.outcome': signal.outcome });
      } else if (signal.kind === 'drawRelayed') {
        telemetry.record('drawingRelayDuration', seconds);
      }
    }
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
