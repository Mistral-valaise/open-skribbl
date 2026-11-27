import type { Effect, ErrorCode, Role, RoomEvent, RoomState, TurnEndReason } from '@kritzel/shared';
import { EXCLUDED_JOIN_REASONS } from './contract.js';

/**
 * What happened in a room during one `reduce` call, in telemetry terms.
 * Signals carry outcomes and counts only: no nickname, text, word or id.
 */
export type Signal =
  | {
      kind: 'join';
      outcome: 'joined' | 'resumed' | 'rejected';
      reason: ErrorCode | 'none';
      role: Role;
      validity: 'valid' | 'excluded';
      /** How long a resumed seat was without a connection; absent when it never lost it. */
      awayMs?: number;
    }
  | {
      kind: 'disconnect';
      cause: 'connection_lost' | 'left' | 'kicked' | 'replaced' | 'seat_expired';
    }
  | { kind: 'gameStarted' }
  | { kind: 'gameCompleted'; durationMs: number }
  | {
      kind: 'gameAborted';
      reason: 'not_enough_players' | 'room_disposed' | 'shutdown';
      durationMs: number;
    }
  | { kind: 'turnEnded'; reason: TurnEndReason }
  | { kind: 'guess'; outcome: 'correct' | 'close' | 'wrong' }
  | { kind: 'rejected'; code: ErrorCode }
  | { kind: 'drawRelayed' };

/**
 * Derives signals from a state transition (spec 015, "Counted once"). The
 * rules in `packages/shared` stay free of telemetry; this observer looks at
 * what they did. One observer belongs to one room and remembers only when
 * the game started and when each seat lost its connection.
 */
export class RoomObserver {
  private gameStartedAt: number | null = null;
  private readonly lostAt = new Map<string, number>();

  observe(
    prev: RoomState,
    event: RoomEvent,
    next: RoomState,
    effects: readonly Effect[],
    now: number,
  ): Signal[] {
    const signals: Signal[] = [];
    const errorTo = (connId: string | null | undefined): ErrorCode | undefined => {
      if (!connId) return undefined;
      for (const effect of effects) {
        if (
          effect.type === 'send' &&
          effect.message.type === 'error' &&
          effect.conns.includes(connId)
        ) {
          return effect.message.code;
        }
      }
      return undefined;
    };

    if (event.type === 'join') {
      const resumedSeat = event.sessionToken
        ? prev.seats.find((seat) => seat.token === event.sessionToken)
        : undefined;
      const joined = effects.some(
        (effect) =>
          effect.type === 'send' &&
          effect.message.type === 'joined' &&
          effect.conns.includes(event.connId),
      );
      if (joined && resumedSeat) {
        const lost = this.lostAt.get(resumedSeat.id);
        this.lostAt.delete(resumedSeat.id);
        if (resumedSeat.connId && resumedSeat.connId !== event.connId) {
          signals.push({ kind: 'disconnect', cause: 'replaced' });
        }
        signals.push({
          kind: 'join',
          outcome: 'resumed',
          reason: 'none',
          role: resumedSeat.role,
          validity: 'valid',
          ...(lost === undefined ? {} : { awayMs: Math.max(0, now - lost) }),
        });
      } else if (joined) {
        signals.push({
          kind: 'join',
          outcome: 'joined',
          reason: 'none',
          role: event.role,
          validity: 'valid',
        });
      } else {
        const reason = errorTo(event.connId) ?? 'bad_request';
        signals.push({
          kind: 'join',
          outcome: 'rejected',
          reason,
          role: event.role,
          validity: EXCLUDED_JOIN_REASONS.includes(reason) ? 'excluded' : 'valid',
        });
      }
    } else if (event.type === 'disconnect') {
      const seat = prev.seats.find((candidate) => candidate.connId === event.connId);
      if (seat) {
        this.lostAt.set(seat.id, now);
        signals.push({ kind: 'disconnect', cause: 'connection_lost' });
      }
    } else if (event.type !== 'timer') {
      const sender = prev.seats.find((seat) => seat.id === event.participantId);
      const code = errorTo(sender?.connId);
      if (code) signals.push({ kind: 'rejected', code });

      if (event.type === 'leave' && sender) {
        signals.push({ kind: 'disconnect', cause: 'left' });
      }
      if (
        event.type === 'kick' &&
        !code &&
        !next.seats.some((seat) => seat.id === event.targetId)
      ) {
        signals.push({ kind: 'disconnect', cause: 'kicked' });
      }
      if (event.type === 'chat' && !code && sender) {
        const guess = guessOutcome(prev, next, sender.id, sender.connId, effects);
        if (guess) signals.push({ kind: 'guess', outcome: guess });
      }
      if (
        event.type === 'drawOp' &&
        !code &&
        effects.some((effect) => effect.type === 'send' && effect.message.type === 'draw.op')
      ) {
        signals.push({ kind: 'drawRelayed' });
      }
    } else if (event.key.startsWith('grace:')) {
      const seatId = event.key.slice('grace:'.length);
      const expired =
        prev.seats.some((seat) => seat.id === seatId) &&
        !next.seats.some((seat) => seat.id === seatId);
      if (expired) signals.push({ kind: 'disconnect', cause: 'seat_expired' });
    }

    for (const seat of prev.seats) {
      if (!next.seats.some((other) => other.id === seat.id)) this.lostAt.delete(seat.id);
    }

    if (prev.game === null && next.game !== null) {
      this.gameStartedAt = now;
      signals.push({ kind: 'gameStarted' });
    }
    if (!prev.turn?.end && next.turn?.end) {
      signals.push({ kind: 'turnEnded', reason: next.turn.end.reason });
    }
    if (prev.phase !== 'gameEnd' && next.phase === 'gameEnd' && next.game) {
      const { game, settings } = next;
      const playedEveryRound =
        !game.endAfterTurn && game.round >= settings.rounds && game.orderIndex >= game.order.length;
      const durationMs = this.takeGameDuration(now);
      signals.push(
        playedEveryRound
          ? { kind: 'gameCompleted', durationMs }
          : { kind: 'gameAborted', reason: 'not_enough_players', durationMs },
      );
    }
    if (effects.some((effect) => effect.type === 'dispose')) {
      signals.push(...this.closed(next, 'room_disposed', now));
    }
    return signals;
  }

  /** The room stops without a reducer call (shutdown), or is disposed mid-game. */
  closed(state: RoomState, reason: 'room_disposed' | 'shutdown', now: number): Signal[] {
    if (state.game === null || state.phase === 'gameEnd' || this.gameStartedAt === null) return [];
    return [{ kind: 'gameAborted', reason, durationMs: this.takeGameDuration(now) }];
  }

  private takeGameDuration(now: number): number {
    const startedAt = this.gameStartedAt ?? now;
    this.gameStartedAt = null;
    return Math.max(0, now - startedAt);
  }
}

/** A chat message is a guess when its sender is a guesser of the turn who has not guessed yet. */
function guessOutcome(
  prev: RoomState,
  next: RoomState,
  seatId: string,
  connId: string | null,
  effects: readonly Effect[],
): 'correct' | 'close' | 'wrong' | undefined {
  const turn = prev.turn;
  if (prev.phase !== 'drawing' || !turn?.word) return undefined;
  if (!turn.guesserIds.includes(seatId) || seatId in turn.guessed) return undefined;
  if (next.turn && seatId in next.turn.guessed) return 'correct';
  const close = effects.some(
    (effect) =>
      effect.type === 'send' &&
      effect.message.type === 'guess.feedback' &&
      effect.message.kind === 'close' &&
      connId !== null &&
      effect.conns.includes(connId),
  );
  return close ? 'close' : 'wrong';
}
