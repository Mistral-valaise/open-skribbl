import {
  createRoomState,
  defaultSettings,
  reduce,
  TIMER,
  TIMING,
  viewFor,
  type Difficulty,
  type Language,
  type RoomEvent,
  type RoomState,
  type ServerMessage,
} from '@kritzel/shared';
import type { Clock } from '../clock.js';
import { RoomObserver, type Signal } from '../telemetry/observe.js';
import { noopTelemetry, type Telemetry } from '../telemetry/telemetry.js';

/** The open socket of one participant, as far as a room cares. */
export interface Connection {
  id: string;
  send(message: ServerMessage): void;
  close(): void;
}

export interface RoomDeps {
  clock: Clock;
  random: () => number;
  words: (language: Language, difficulty: Difficulty) => readonly string[];
  onDispose: (code: string) => void;
  telemetry?: Telemetry;
}

/**
 * Runtime of one room: owns the state, feeds events to the reducer one at a
 * time and executes the effects (docs/ARCHITECTURE.md §6).
 */
export class Room {
  private current: RoomState;
  private readonly conns = new Map<string, Connection>();
  private readonly timers = new Map<string, () => void>();
  private disposed = false;
  private readonly telemetry: Telemetry;
  private readonly observer = new RoomObserver();

  constructor(
    readonly code: string,
    language: Language,
    private readonly deps: RoomDeps,
  ) {
    this.telemetry = deps.telemetry ?? noopTelemetry;
    this.current = createRoomState(code, defaultSettings(language));
    // A room nobody joins is disposed like an abandoned one (spec 001).
    this.setTimer(TIMER.empty, deps.clock.now() + TIMING.emptyRoomMs);
  }

  get state(): RoomState {
    return this.current;
  }

  attach(conn: Connection): void {
    this.conns.set(conn.id, conn);
  }

  /** Called when a socket closes. */
  detach(connId: string): void {
    if (!this.conns.delete(connId)) return;
    this.dispatch({ type: 'disconnect', connId });
  }

  participantOf(connId: string): string | undefined {
    return this.current.seats.find((seat) => seat.connId === connId)?.id;
  }

  /**
   * Applies one event. Returns what it did in telemetry terms (spec 015);
   * the list is empty when telemetry is off.
   */
  dispatch(event: RoomEvent): Signal[] {
    if (this.disposed) return [];
    const { clock, random, words } = this.deps;
    const startedAt = this.telemetry.now();
    const now = clock.now();
    const previous = this.current;
    const { state, effects } = reduce(previous, event, { now, random, words });
    this.current = state;

    let disposing = false;
    for (const effect of effects) {
      if (disposing) break;
      switch (effect.type) {
        case 'send':
          for (const connId of effect.conns) this.conns.get(connId)?.send(effect.message);
          break;
        case 'broadcastState':
          for (const seat of state.seats) {
            if (!seat.connId) continue;
            this.conns
              .get(seat.connId)
              ?.send({ type: 'room.state', state: viewFor(state, seat.id, now) });
          }
          break;
        case 'close': {
          const conn = this.conns.get(effect.connId);
          this.conns.delete(effect.connId);
          conn?.close();
          break;
        }
        case 'setTimer':
          this.setTimer(effect.key, effect.at);
          break;
        case 'clearTimer':
          this.clearTimer(effect.key);
          break;
        case 'dispose':
          disposing = true;
          break;
      }
    }

    // Recorded after the fan-out, so durations and spans include it.
    const signals = this.telemetry.enabled
      ? this.observer.observe(previous, event, state, effects, now)
      : [];
    this.telemetry.roomSignals(signals, startedAt);
    if (disposing) this.dispose();
    return signals;
  }

  /** Tells everyone the server is stopping and closes the room. */
  shutdown(): void {
    if (this.disposed) return;
    this.telemetry.roomSignals(
      this.observer.closed(this.current, 'shutdown', this.deps.clock.now()),
      this.telemetry.now(),
    );
    for (const conn of this.conns.values()) conn.send({ type: 'server.shutdown' });
    this.dispose();
  }

  private setTimer(key: string, at: number): void {
    this.clearTimer(key);
    const cancel = this.deps.clock.setTimer(at, () => {
      this.timers.delete(key);
      this.dispatch({ type: 'timer', key });
    });
    this.timers.set(key, cancel);
  }

  private clearTimer(key: string): void {
    this.timers.get(key)?.();
    this.timers.delete(key);
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const cancel of this.timers.values()) cancel();
    this.timers.clear();
    for (const conn of this.conns.values()) conn.close();
    this.conns.clear();
    this.deps.onDispose(this.code);
  }
}
