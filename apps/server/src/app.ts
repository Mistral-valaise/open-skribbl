import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { loadWordLists } from '@kritzel/content';
import { LANGUAGES, MAX_FRAME_BYTES, type Difficulty, type Language } from '@kritzel/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { systemClock, type Clock } from './clock.js';
import { handleConnection } from './gateway.js';
import { TokenBucket } from './rateLimit.js';
import { RoomRegistry, ServerFullError } from './rooms/registry.js';

export interface AppOptions {
  maxRooms?: number;
  trustProxy?: boolean;
  clock?: Clock;
  random?: () => number;
  words?: (language: Language, difficulty: Difficulty) => readonly string[];
  /** Directory of the built web app; served when it exists. */
  webDir?: string;
}

export interface App {
  server: FastifyInstance;
  registry: RoomRegistry;
}

const ROOM_CREATIONS_PER_MINUTE = 10;

/** Next to the source in development (`apps/web/dist`), next to the bundle in production. */
function defaultWebDir(): string {
  const candidates = ['./web', '../../web/dist'].map((path) =>
    fileURLToPath(new URL(path, import.meta.url)),
  );
  return candidates.find((path) => existsSync(join(path, 'index.html'))) ?? candidates[0]!;
}

/** HTTP API, static files and the WebSocket endpoint (docs/ARCHITECTURE.md §4 and §6). */
export async function createApp(options: AppOptions = {}): Promise<App> {
  const clock = options.clock ?? systemClock;
  const wordLists = options.words ? null : loadWordLists();
  const registry = new RoomRegistry(
    {
      clock,
      random: options.random ?? Math.random,
      words: options.words ?? ((language, difficulty) => wordLists!.get(language, difficulty)),
    },
    options.maxRooms ?? 500,
  );

  const server = Fastify({ trustProxy: options.trustProxy ?? false });
  await server.register(fastifyWebsocket, {
    options: { maxPayload: MAX_FRAME_BYTES * 4 },
    // Tell participants before their sockets close (spec 007, "Shutdown").
    preClose(done) {
      registry.shutdown();
      for (const client of server.websocketServer.clients) client.close(1001);
      done();
    },
  });

  server.get('/healthz', async () => ({ status: 'ok' }));

  const creationBuckets = new Map<string, TokenBucket>();
  server.post('/api/rooms', async (request, reply) => {
    const now = clock.now();
    let bucket = creationBuckets.get(request.ip);
    if (!bucket) {
      if (creationBuckets.size > 10_000) creationBuckets.clear();
      bucket = new TokenBucket(ROOM_CREATIONS_PER_MINUTE, ROOM_CREATIONS_PER_MINUTE / 60, now);
      creationBuckets.set(request.ip, bucket);
    }
    if (!bucket.take(now)) return reply.code(429).send({ error: 'rate_limited' });

    const body = (request.body ?? {}) as { language?: unknown };
    const language = LANGUAGES.find((candidate) => candidate === body.language) ?? 'en';
    try {
      return reply.code(201).send({ code: registry.create(language).code });
    } catch (error) {
      if (error instanceof ServerFullError) return reply.code(503).send({ error: 'server_full' });
      throw error;
    }
  });

  server.get<{ Params: { code: string } }>('/api/rooms/:code', async (request, reply) => {
    const room = registry.get(request.params.code);
    if (!room) return reply.code(404).send({ error: 'room_not_found' });
    return { exists: true, code: room.code, phase: room.state.phase };
  });

  server.get('/ws', { websocket: true }, (socket) => handleConnection(socket, registry, clock));

  const webDir = options.webDir ?? defaultWebDir();
  const hasWeb = existsSync(join(webDir, 'index.html'));
  if (hasWeb) await server.register(fastifyStatic, { root: webDir });
  server.setNotFoundHandler((request, reply) => {
    const isPage = request.method === 'GET' && !request.url.startsWith('/api/');
    if (hasWeb && isPage) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'not_found' });
  });

  return { server, registry };
}
