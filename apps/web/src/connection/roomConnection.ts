import type { ClientMessage, JoinMessage, ServerMessage } from '@kritzel/shared';
import { reconnectDelay } from './backoff.js';

export interface RoomConnectionOptions {
  url: string;
  /** Built for every attempt, so a reconnect sends the latest session token. */
  buildJoin: () => JoinMessage;
  onMessage: (message: ServerMessage) => void;
  /** The socket closed or could not open; another attempt is scheduled. */
  onLost: () => void;
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

  constructor(private readonly options: RoomConnectionOptions) {}

  start(): void {
    if (this.stopped || this.socket) return;
    const socket = new WebSocket(this.options.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket === socket) socket.send(JSON.stringify(this.options.buildJoin()));
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      const message = parseServerMessage(event.data);
      if (message) this.options.onMessage(message);
    });
    socket.addEventListener('close', () => {
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
