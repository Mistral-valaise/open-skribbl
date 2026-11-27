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
import { SPANS } from './telemetry/contract.js';
import { instrumentHttp } from './telemetry/http.js';
import { registerRum } from './telemetry/rum.js';
import { noopTelemetry, type Telemetry } from './telemetry/telemetry.js';

/** Structured log sink; the default discards everything (tests). */
export type Logger = (
  level: 'debug' | 'info' | 'warn' | 'error',
  msg: string,
  context?: Record<string, unknown>,
) => void;

export interface AppOptions {
  maxRooms?: number;
  trustProxy?: boolean;
  log?: Logger;
  /** Records nothing unless given (spec 015). */
  telemetry?: Telemetry;
  /** Offer and accept browser measurements (spec 015). */
  rum?: boolean;
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

/** Spec 012: only the app's own origin, plus data and blob images for avatars and exports. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

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
  const log: Logger = options.log ?? (() => undefined);
  const telemetry = options.telemetry ?? noopTelemetry;
  const wordLists = options.words ? null : loadWordLists();
  const registry = new RoomRegistry(
    {
      onRoomDisposed: (code, rooms) => log('info', 'room disposed', { room: code, rooms }),
      clock,
      random: options.random ?? Math.random,
      words: options.words ?? ((language, difficulty) => wordLists!.get(language, difficulty)),
      telemetry,
    },
    options.maxRooms ?? 500,
  );

  const server = Fastify({ trustProxy: options.trustProxy ?? false });
  // Before any route, so every route inherits the hooks.
  const http = instrumentHttp(server, telemetry);
  await server.register(fastifyWebsocket, {
    options: { maxPayload: MAX_FRAME_BYTES * 4 },
    // Tell participants before their sockets close (spec 007, "Shutdown").
    preClose(done) {
      registry.shutdown();
      for (const client of server.websocketServer.clients) client.close(1001);
      done();
    },
  });

  server.addHook('onSend', async (request, reply) => {
    reply.header('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
  });

  server.get('/healthz', async () => ({ status: 'ok' }));

  const creationBuckets = new Map<string, TokenBucket>();
  server.post('/api/rooms', async (request, reply) =>
    http.within(request, () =>
      telemetry.span(SPANS.roomCreate, {}, (span) => {
        const refused = (reason: 'rate_limited' | 'server_full') => {
          span.setAttribute('kritzel.outcome', 'rejected');
          span.setAttribute('kritzel.reason', reason);
          telemetry.count('roomsCreated', {
            'kritzel.outcome': 'rejected',
            'kritzel.reason': reason,
          });
        };
        const now = clock.now();
        let bucket = creationBuckets.get(request.ip);
        if (!bucket) {
          if (creationBuckets.size > 10_000) creationBuckets.clear();
          bucket = new TokenBucket(ROOM_CREATIONS_PER_MINUTE, ROOM_CREATIONS_PER_MINUTE / 60, now);
          creationBuckets.set(request.ip, bucket);
        }
        if (!bucket.take(now)) {
          refused('rate_limited');
          telemetry.count('rateLimitHits', { 'kritzel.scope': 'room_create' });
          return reply.code(429).send({ error: 'rate_limited' });
        }

        const body = (request.body ?? {}) as { language?: unknown };
        const language = LANGUAGES.find((candidate) => candidate === body.language) ?? 'en';
        try {
          const room = registry.create(language);
          span.setAttribute('kritzel.outcome', 'created');
          telemetry.count('roomsCreated', {
            'kritzel.outcome': 'created',
            'kritzel.reason': 'none',
          });
          log('info', 'room created', { room: room.code, rooms: registry.size });
          return reply.code(201).send({ code: room.code });
        } catch (error) {
          if (error instanceof ServerFullError) {
            refused('server_full');
            log('warn', 'room refused', { reason: 'server_full', rooms: registry.size });
            return reply.code(503).send({ error: 'server_full' });
          }
          throw error;
        }
      }),
    ),
  );

  server.get<{ Params: { code: string } }>('/api/rooms/:code', async (request, reply) => {
    const room = registry.get(request.params.code);
    if (!room) return reply.code(404).send({ error: 'room_not_found' });
    return { exists: true, code: room.code, phase: room.state.phase };
  });

  const rum = (options.rum ?? false) && telemetry.enabled;
  registerRum(server, { telemetry, clock, enabled: rum });

  server.get('/ws', { websocket: true }, (socket) =>
    handleConnection(socket, registry, clock, log, { telemetry, acceptTraceparent: rum }),
  );

  if (telemetry.enabled) {
    telemetry.observe('roomsActive', () => registry.size);
    telemetry.observe('playersConnected', () => registry.connected().players);
    telemetry.observe('spectatorsConnected', () => registry.connected().spectators);
    telemetry.observe('wsConnectionsActive', () => server.websocketServer.clients.size);
  }

  const webDir = options.webDir ?? defaultWebDir();
  const hasWeb = existsSync(join(webDir, 'index.html'));
  if (hasWeb) {
    await server.register(fastifyStatic, {
      root: webDir,
      // Hashed assets never change; everything else is revalidated.
      cacheControl: false,
      setHeaders(reply, path) {
        const immutable = path.includes('/assets/');
        reply.header(
          'Cache-Control',
          immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  }
  server.setNotFoundHandler((request, reply) => {
    const isPage = request.method === 'GET' && !request.url.startsWith('/api/');
    if (hasWeb && isPage) return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    return reply.code(404).send({ error: 'not_found' });
  });

  return { server, registry };
}
