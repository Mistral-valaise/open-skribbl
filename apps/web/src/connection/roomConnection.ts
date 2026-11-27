import type { ClientMessage, JoinMessage, ServerMessage } from '@kritzel/shared';
import { reconnectDelay } from './backoff.js';

export interface RoomConnectionOptions {
  url: string;
  /** Built for every attempt, so a reconnect sends the latest session token. */
  buildJoin: () => JoinMessage;
  onMessage: (message: ServerMessage) => void;
  /** The socket closed or could not open; another attempt is scheduled. */
  onLost: () => void;
  /**
   * Called when a socket is opened, to time the attempt (spec 015). The first
   * connection is a `join`; an attempt after a seat was held is a `reconnect`.
   */
  measureAttempt?: (name: 'join' | 'reconnect') => AttemptTiming | null;
}

/** The measurement of one attempt, from opening the socket to `joined`. */
export interface AttemptTiming {
  /** Sent with the `join` message, so the server's span joins the browser's trace. */
  readonly traceparent: string;
  /** Only the first call counts. */
  settle(outcome: 'ok' | 'failed'): void;
}

/** The server's messages are trusted to match the protocol; only the envelope is checked. */
function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null;
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value !== 'object' || value === null) return null;
    return 'type' in value && typeof value.type === 'string' ? (value as ServerMessage) : null;
  } catch {
    return null;
  }
}

/**
 * One participant's WebSocket to a room: sends `join` first on every socket and
 * reconnects with backoff until it is stopped (docs/ARCHITECTURE.md §4).
 */
export class RoomConnection {
  private socket: WebSocket | null = null;
  private retryTimer: number | undefined;
  private attempt = 0;
  private stopped = false;
  private everJoined = false;

  constructor(private readonly options: RoomConnectionOptions) {}

  start(): void {
    if (this.stopped || this.socket) return;
    const timing = this.options.measureAttempt?.(this.everJoined ? 'reconnect' : 'join') ?? null;
    const socket = new WebSocket(this.options.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      const join = this.options.buildJoin();
      socket.send(JSON.stringify(timing ? { ...join, traceparent: timing.traceparent } : join));
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      const message = parseServerMessage(event.data);
      if (!message) return;
      if (message.type === 'joined') {
        this.everJoined = true;
        timing?.settle('ok');
      }
      this.options.onMessage(message);
    });
    socket.addEventListener('close', () => {
      // Closed before `joined`, by either side: the attempt failed.
      timing?.settle('failed');
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.stopped) return;
      this.options.onLost();
      this.retryTimer = window.setTimeout(() => this.start(), reconnectDelay(this.attempt));
      this.attempt += 1;
    });
  }

  /** The server accepted the join: the next loss starts the backoff from the beginning. */
  confirmJoined(): void {
    this.attempt = 0;
  }

  /** Returns false when the message could not be sent because the socket is not open. */
  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  /** Closes the socket for good; no further attempts are made. */
  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.retryTimer);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}

export function webSocketUrl(location: Pick<Location, 'protocol' | 'host'>): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}
