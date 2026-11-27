import type { AddressInfo } from 'node:net';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '@kritzel/shared';
import WebSocket from 'ws';
import { createApp, type App, type AppOptions } from '../app.js';
import { ManualClock } from './manualClock.js';

/** A started server on an ephemeral port with a manual clock, for integration tests. */
export interface TestServer {
  app: App;
  clock: ManualClock;
  url: string;
  createRoom(): Promise<string>;
  connect(): Promise<TestClient>;
  close(): Promise<void>;
}

export const TEST_WORDS = ['lighthouse', 'windmill', 'suitcase', 'backpack', 'campfire', 'dolphin'];

export async function startTestServer(options: AppOptions = {}): Promise<TestServer> {
  const clock = new ManualClock();
  const app = await createApp({
    clock,
    words: () => TEST_WORDS,
    webDir: '/nonexistent',
    ...options,
  });
  await app.server.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const clients: TestClient[] = [];

  return {
    app,
    clock,
    url,
    async createRoom() {
      const response = await fetch(`${url}/api/rooms`, { method: 'POST' });
      return ((await response.json()) as { code: string }).code;
    },
    async connect() {
      const client = await TestClient.open(`ws://127.0.0.1:${port}/ws`);
      clients.push(client);
      return client;
    },
    async close() {
      for (const client of clients) client.close();
      await app.server.close();
    },
  };
}

type Joined = Extract<ServerMessage, { type: 'joined' }>;

export class TestClient {
  readonly messages: ServerMessage[] = [];
  closed = false;
  private waiters: (() => void)[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => {
      this.messages.push(JSON.parse(String(data)) as ServerMessage);
      this.notify();
    });
    socket.on('close', () => {
      this.closed = true;
      this.notify();
    });
  }

  static open(url: string): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.once('open', () => resolve(new TestClient(socket)));
      socket.once('error', reject);
    });
  }

  private notify(): void {
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((wake) => wake());
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  sendRaw(data: string): void {
    this.socket.send(data);
  }

  close(): void {
    this.socket.close();
  }

  /** Resolves once `predicate` holds, checking again after every message. */
  async until(predicate: () => boolean, what = 'condition', timeoutMs = 2_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`Timed out waiting for ${what}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, remaining);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  of<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.messages.filter(
      (message): message is Extract<ServerMessage, { type: T }> => message.type === type,
    );
  }

  async next<T extends ServerMessage['type']>(
    type: T,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const seen = this.of(type).length;
    await this.until(() => this.of(type).length > seen, `a "${type}" message`);
    return this.of(type)[seen]!;
  }

  get errors(): string[] {
    return this.of('error').map((message) => message.code);
  }

  get lastState() {
    const state = [...this.messages]
      .reverse()
      .find((message) => message.type === 'room.state' || message.type === 'joined');
    return state && 'state' in state ? state.state : undefined;
  }

  async join(
    roomCode: string,
    nickname: string,
    extra: Partial<ClientMessage> = {},
  ): Promise<Joined> {
    this.send({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      roomCode,
      nickname,
      avatar: { body: 0, eyes: 0, mouth: 0, accessory: 0 },
      role: 'player',
      clientId: `client-${nickname}`,
      ...extra,
    } as ClientMessage);
    const errorsBefore = this.errors.length;
    await this.until(
      () => this.of('joined').length > 0 || this.errors.length > errorsBefore,
      'join result',
    );
    const joined = this.of('joined')[0];
    if (!joined) throw new Error(`join failed: ${this.errors.slice(errorsBefore).join(', ')}`);
    return joined;
  }
}
