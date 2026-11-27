import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type RoomView,
  type ServerMessage,
} from '@kritzel/shared';
import WebSocket from 'ws';
import { guessText, type GamePlan, type TurnPlan } from './plan.js';

export interface PlayOptions {
  /** Base URL of the game, for example `http://kritzel:3000`. */
  url: string;
  /** Milliseconds between a player's actions; 0 plays as fast as the server allows. */
  paceMs: number;
  log: (event: string, context?: Record<string, unknown>) => void;
}

export interface GameResult {
  completed: boolean;
  turnsPlayed: number;
  reconnects: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One synthetic participant: a WebSocket and what the server last told it. */
class Participant {
  state: RoomView | undefined;
  token = '';
  id = '';
  choices: string[] = [];
  private socket!: WebSocket;
  private waiters: (() => void)[] = [];

  constructor(
    private readonly wsUrl: string,
    readonly name: string,
    readonly clientId: string,
    private readonly role: 'player' | 'spectator',
  ) {}

  async join(roomCode: string): Promise<boolean> {
    this.socket = new WebSocket(this.wsUrl);
    await new Promise<void>((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    let refused = false;
    this.socket.on('message', (data) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      if (message.type === 'joined') {
        this.state = message.state;
        this.token = message.sessionToken;
        this.id = message.participantId;
      } else if (message.type === 'room.state') {
        this.state = message.state;
      } else if (message.type === 'word.choices') {
        this.choices = message.words;
      } else if (message.type === 'error' && !this.id) {
        refused = true;
      }
      this.wake();
    });
    this.socket.on('close', () => this.wake());
    this.send({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      roomCode,
      nickname: this.name,
      avatar: { body: 0, eyes: 0, mouth: 0, accessory: 0 },
      role: this.role,
      clientId: this.clientId,
      ...(this.token ? { sessionToken: this.token } : {}),
    });
    const joinedBefore = this.state;
    await this.until(
      () => refused || this.socket.readyState !== WebSocket.OPEN || this.state !== joinedBefore,
      'join answer',
    );
    return !refused && this.socket.readyState === WebSocket.OPEN;
  }

  send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  /** Drops the connection without a `leave`, as a lost network would. */
  drop(): void {
    this.socket.terminate();
  }

  close(): void {
    this.send({ type: 'leave' });
    this.socket.close();
  }

  private wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter();
  }

  async until(condition: () => boolean, what: string, timeoutMs = 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timed out waiting for ${what}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(remaining, 1000));
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
}

async function createRoom(url: string): Promise<string | null> {
  const response = await fetch(`${url}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ language: 'en' }),
  });
  if (!response.ok) return null;
  return ((await response.json()) as { code: string }).code;
}

async function playTurn(
  turn: TurnPlan,
  players: Participant[],
  code: string,
  options: PlayOptions,
): Promise<number> {
  const any = players[0]!;
  await Promise.all(
    players.map((player) => player.until(() => player.state?.phase === 'choosing', 'choosing')),
  );
  const drawer = players.find((player) => player.state?.drawerId === player.id)!;
  const guessers = players.filter((player) => player !== drawer);
  await drawer.until(() => drawer.choices.length > 0, 'word choices');
  const wordIndex = Math.min(turn.wordIndex, drawer.choices.length - 1);
  const word = drawer.choices[wordIndex]!;
  drawer.choices = [];
  drawer.send({ type: 'word.choose', index: wordIndex });
  await any.until(() => any.state?.phase === 'drawing', 'drawing');

  let stroke = 0;
  for (const plan of turn.strokes) {
    const id = `t${stroke++}`;
    const [x, y, ...rest] = plan.points as [number, number, ...number[]];
    drawer.send({
      type: 'draw.op',
      op: { type: 'stroke.start', id, tool: 'brush', color: plan.color, size: plan.size, x, y },
    } as ClientMessage);
    for (let index = 0; index < rest.length; index += 8) {
      drawer.send({
        type: 'draw.op',
        op: { type: 'stroke.points', id, points: rest.slice(index, index + 8) },
      } as ClientMessage);
      await sleep(options.paceMs / 4);
    }
    drawer.send({ type: 'draw.op', op: { type: 'stroke.end', id } } as ClientMessage);
    await sleep(options.paceMs);
  }
  if (turn.fill) {
    drawer.send({
      type: 'draw.op',
      op: { type: 'fill', x: 400, y: 300, color: '#F5B041' },
    } as ClientMessage);
  }
  if (turn.strayDrawBy !== null) {
    guessers[turn.strayDrawBy % guessers.length]!.send({
      type: 'draw.op',
      op: { type: 'clear' },
    } as ClientMessage);
  }

  let reconnects = 0;
  if (turn.reconnect) {
    const absent = guessers[turn.reconnect.guesser % guessers.length]!;
    absent.drop();
    await sleep(turn.reconnect.awayMs);
    if (await absent.join(code)) reconnects += 1;
  }
  if (turn.reaction) guessers[0]!.send({ type: 'reaction.send', emoji: '👏' });

  for (const guess of turn.guesses) {
    const guesser = guessers[guess.guesser % guessers.length]!;
    guesser.send({ type: 'chat.send', text: guessText(guess.kind, word) });
    // Chat allows a burst of five, then one message per second (spec 004).
    await sleep(Math.max(options.paceMs, 250));
  }
  await any.until(
    () => any.state?.phase === 'turnEnd' || any.state?.phase === 'gameEnd',
    'turn end',
    120_000,
  );
  options.log('turn finished', { reason: any.state?.turnEnd?.reason, reconnects });
  return reconnects;
}

/**
 * Plays one planned game in a new room and leaves. Returns whether the game
 * reached the results screen.
 */
export async function playGame(plan: GamePlan, options: PlayOptions): Promise<GameResult> {
  const wsUrl = `${options.url.replace(/^http/, 'ws')}/ws`;
  const code = await createRoom(options.url);
  if (!code) {
    options.log('room refused');
    return { completed: false, turnsPlayed: 0, reconnects: 0 };
  }
  const tag = `${plan.seed.toString(36)}-${Date.now().toString(36)}`;
  const players = Array.from(
    { length: plan.players },
    (_, index) => new Participant(wsUrl, `Synth ${index + 1}`, `traffic-${tag}-${index}`, 'player'),
  );
  const everyone = [...players];
  let reconnects = 0;
  let turnsPlayed = 0;
  try {
    if (plan.wrongCode) {
      const stray = new Participant(wsUrl, 'Synth lost', `traffic-${tag}-lost`, 'player');
      await stray.join('ZZZZZZ');
    }
    for (const player of players) {
      if (!(await player.join(code))) throw new Error('join refused');
    }
    if (plan.spectator) {
      const spectator = new Participant(wsUrl, 'Synth watch', `traffic-${tag}-w`, 'spectator');
      if (await spectator.join(code)) everyone.push(spectator);
    }
    const host = players[0]!;
    host.send({ type: 'settings.update', settings: { rounds: 1, drawTime: 30 } });
    await host.until(() => host.state?.settings.rounds === 1, 'settings');
    host.send({ type: 'game.start' });

    for (const turn of plan.turns) {
      reconnects += await playTurn(turn, players, code, options);
      turnsPlayed += 1;
      if (host.state?.phase === 'gameEnd') break;
    }
    await host.until(() => host.state?.phase === 'gameEnd', 'results', 60_000);
    return { completed: true, turnsPlayed, reconnects };
  } finally {
    for (const participant of everyone) participant.close();
  }
}

/**
 * Creates rooms until the server is full and keeps asking: each refusal is a
 * real 503 from a real limit, which is what the API availability objective
 * counts. Used to show an error budget burning (docs/OBSERVABILITY.md).
 */
export async function fillServer(
  options: PlayOptions,
  seconds: number,
): Promise<{ created: number; refused: number; limited: number }> {
  const counts = { created: 0, refused: 0, limited: 0 };
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const response = await fetch(`${options.url}/api/rooms`, { method: 'POST' });
    if (response.status === 201) counts.created += 1;
    else if (response.status === 503) counts.refused += 1;
    else if (response.status === 429) counts.limited += 1;
    // Room creation is limited to ten per minute and address.
    await sleep(response.status === 429 ? 6000 : 500);
  }
  options.log('server-full scenario finished', counts);
  return counts;
}
