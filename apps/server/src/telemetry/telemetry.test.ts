import { SpanStatusCode } from '@opentelemetry/api';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogger } from '../log.js';
import { startTestServer, type TestClient, type TestServer } from '../testing/client.js';
import { createTestTelemetry, total, type TestTelemetry } from '../testing/telemetry.js';
import { DRAW_SPAN_SAMPLE_EVERY, DURATION_BUCKETS, SERIES_BUDGET } from './contract.js';

let server: TestServer;
let probe: TestTelemetry;
afterEach(async () => {
  await server?.close();
  await probe?.shutdown();
});

async function start(options: Parameters<typeof startTestServer>[0] = {}) {
  probe = createTestTelemetry();
  server = await startTestServer({ telemetry: probe.telemetry, ...options });
  return server;
}

/** Joins `names` to a new room; the first is the host. */
async function room(...names: string[]): Promise<{ code: string; clients: TestClient[] }> {
  const code = await server.createRoom();
  const clients: TestClient[] = [];
  for (const name of names) {
    const client = await server.connect();
    await client.join(code, name);
    clients.push(client);
  }
  return { code, clients };
}

/** Plays one turn: the drawer picks the first word and every guesser guesses it. */
async function playTurn(clients: TestClient[]): Promise<void> {
  const any = clients[0]!;
  // Every client must have seen the new turn before the drawer can be told apart.
  for (const client of clients) {
    await client.until(() => client.lastState?.phase === 'choosing', 'choosing phase');
  }
  const drawer = clients.find((client) => client.lastState?.drawerId === client.lastState?.you.id)!;
  await drawer.until(() => drawer.of('word.choices').length > 0, 'word choices');
  const word = drawer.of('word.choices').at(-1)!.words[0]!;
  drawer.send({ type: 'word.choose', index: 0 });
  await any.until(() => any.lastState?.phase === 'drawing', 'drawing phase');
  for (const client of clients) {
    if (client !== drawer) client.send({ type: 'chat.send', text: word });
  }
  await any.until(() => any.lastState?.phase === 'turnEnd', 'turn end');
}

/** Plays a one-round game to the results screen. */
async function playGame(clients: TestClient[]): Promise<void> {
  const host = clients[0]!;
  host.send({ type: 'settings.update', settings: { rounds: 1 } });
  await host.until(() => host.lastState?.settings.rounds === 1, 'settings');
  host.send({ type: 'game.start' });
  for (let turn = 0; turn < clients.length; turn += 1) {
    await playTurn(clients);
    server.clock.advance(6_000);
    // Chat is limited to one message per second after the burst.
    server.clock.advance(1_000);
  }
  await host.until(() => host.lastState?.phase === 'gameEnd', 'results');
}

describe('gauges and counters (spec 015)', () => {
  it('AC-015-06: gauges follow rooms, players, spectators and connections', async () => {
    await start();
    const code = await server.createRoom();
    const [mara, noa, watcher] = [
      await server.connect(),
      await server.connect(),
      await server.connect(),
    ];
    await mara.join(code, 'Mara');
    await noa.join(code, 'Noa');
    await watcher.join(code, 'Wim', { role: 'spectator' });

    let points = await probe.metrics();
    expect(total(points, 'kritzel.rooms.active')).toBe(1);
    expect(total(points, 'kritzel.players.connected')).toBe(2);
    expect(total(points, 'kritzel.spectators.connected')).toBe(1);
    expect(total(points, 'kritzel.ws.connections.active')).toBe(3);

    for (const client of [mara, noa, watcher]) {
      client.close();
      await client.until(() => client.closed, 'close');
    }
    await expect.poll(() => server.app.server.websocketServer.clients.size).toBe(0);
    server.clock.advance(5 * 60_000);
    points = await probe.metrics();
    expect(total(points, 'kritzel.rooms.active')).toBe(0);
    expect(total(points, 'kritzel.players.connected')).toBe(0);
    expect(total(points, 'kritzel.spectators.connected')).toBe(0);
    expect(total(points, 'kritzel.ws.connections.active')).toBe(0);
  });

  it('AC-015-07: a game is counted once at its start and once at its end', async () => {
    await start();
    const { clients } = await room('Mara', 'Noa', 'Oli');
    await playGame(clients);

    let points = await probe.metrics();
    expect(total(points, 'kritzel.games.started')).toBe(1);
    expect(total(points, 'kritzel.games.completed')).toBe(1);
    expect(total(points, 'kritzel.games.aborted')).toBe(0);
    expect(total(points, 'kritzel.turns.ended', { 'kritzel.reason': 'all_guessed' })).toBe(3);
    const duration = points.find((point) => point.name === 'kritzel.game.duration')!;
    expect(duration.value).toBe(1);
    expect(duration.labels['kritzel.outcome']).toBe('finished');
    expect(duration.sum).toBeGreaterThanOrEqual(14);

    // A second game that loses its players is an abort, not a completion.
    const second = await room('Pia', 'Quin');
    second.clients[0]!.send({ type: 'game.start' });
    await second.clients[0]!.next('word.choices');
    for (const client of second.clients) {
      client.close();
      await client.until(() => client.closed, 'close');
    }
    await expect
      .poll(() => server.app.registry.get(second.code)?.state.seats.every((seat) => !seat.connId))
      .toBe(true);
    server.clock.advance(60_000);
    points = await probe.metrics();
    expect(total(points, 'kritzel.games.started')).toBe(2);
    expect(total(points, 'kritzel.games.completed')).toBe(1);
    expect(total(points, 'kritzel.games.aborted')).toBe(1);
  });

  it('AC-015-07: a game interrupted by shutdown is an abort with reason shutdown', async () => {
    await start();
    const { clients } = await room('Mara', 'Noa');
    clients[0]!.send({ type: 'game.start' });
    await clients[0]!.next('word.choices');
    await server.app.server.close();
    const points = await probe.metrics();
    expect(total(points, 'kritzel.games.aborted', { 'kritzel.reason': 'shutdown' })).toBe(1);
  });

  it('AC-015-08: join attempts are counted by outcome, reason and validity', async () => {
    await start();
    const { code } = await room('Mara');
    const lost = await server.connect();
    await expect(lost.join('ZZZZZZ', 'Noa')).rejects.toThrow('room_not_found');
    const unnamed = await server.connect();
    await expect(unnamed.join(code, '   ')).rejects.toThrow('invalid_nickname');

    const points = await probe.metrics();
    const joins = 'kritzel.join.attempts';
    expect(
      total(points, joins, {
        'kritzel.outcome': 'joined',
        'kritzel.reason': 'none',
        'kritzel.role': 'player',
        'kritzel.validity': 'valid',
      }),
    ).toBe(1);
    expect(
      total(points, joins, {
        'kritzel.outcome': 'rejected',
        'kritzel.reason': 'room_not_found',
        'kritzel.validity': 'excluded',
      }),
    ).toBe(1);
    expect(
      total(points, joins, {
        'kritzel.outcome': 'rejected',
        'kritzel.reason': 'invalid_nickname',
        'kritzel.validity': 'excluded',
      }),
    ).toBe(1);
    expect(total(points, joins)).toBe(3);
  });

  it('AC-015-09: disconnect, reconnect and leave are told apart', async () => {
    await start();
    const { code, clients } = await room('Mara', 'Noa');
    const [mara, noa] = clients as [TestClient, TestClient];
    const token = noa.of('joined')[0]!.sessionToken;

    noa.close();
    await mara.until(
      () => mara.lastState?.participants.find((p) => p.nickname === 'Noa')?.connected === false,
      'Noa disconnected',
    );
    server.clock.advance(4_000);
    const back = await server.connect();
    await back.join(code, 'Noa', { sessionToken: token });

    let points = await probe.metrics();
    expect(total(points, 'kritzel.disconnects', { 'kritzel.cause': 'connection_lost' })).toBe(1);
    expect(total(points, 'kritzel.reconnects')).toBe(1);
    const away = points.find((point) => point.name === 'kritzel.reconnect.duration')!;
    expect(away.value).toBe(1);
    expect(away.sum).toBeCloseTo(4, 5);
    expect(total(points, 'kritzel.join.attempts', { 'kritzel.outcome': 'resumed' })).toBe(1);

    back.send({ type: 'leave' });
    await back.until(() => back.closed, 'close');
    points = await probe.metrics();
    expect(total(points, 'kritzel.disconnects', { 'kritzel.cause': 'left' })).toBe(1);
    expect(total(points, 'kritzel.disconnects', { 'kritzel.cause': 'connection_lost' })).toBe(1);
    expect(total(points, 'kritzel.reconnects')).toBe(1);
  });

  it('AC-015-10: guesses are counted once each as correct, close or wrong', async () => {
    await start();
    const { clients } = await room('Mara', 'Noa');
    const [mara, noa] = clients as [TestClient, TestClient];
    mara.send({ type: 'game.start' });
    const word = (await mara.next('word.choices')).words[0]!;
    mara.send({ type: 'word.choose', index: 0 });
    await noa.until(() => noa.lastState?.phase === 'drawing', 'drawing');

    noa.send({ type: 'chat.send', text: 'zzzzzz' });
    noa.send({ type: 'chat.send', text: `${word.slice(0, -1)}x` });
    noa.send({ type: 'chat.send', text: word });
    mara.send({ type: 'chat.send', text: 'the drawer chats' });
    await noa.until(() => noa.lastState?.phase === 'turnEnd', 'turn end');
    await mara.until(() => mara.of('chat.message').some((m) => m.kind === 'chat' && m.from !== ''));

    const points = await probe.metrics();
    expect(total(points, 'kritzel.guesses', { 'kritzel.outcome': 'wrong' })).toBe(1);
    expect(total(points, 'kritzel.guesses', { 'kritzel.outcome': 'close' })).toBe(1);
    expect(total(points, 'kritzel.guesses', { 'kritzel.outcome': 'correct' })).toBe(1);
    expect(total(points, 'kritzel.guesses')).toBe(3);
  });

  it('AC-015-11: messages are counted by type and outcome, rejections by code, rate limits by scope', async () => {
    await start();
    const { clients } = await room('Mara', 'Noa');
    const [mara, noa] = clients as [TestClient, TestClient];
    mara.send({ type: 'game.start' });
    await mara.next('word.choices');
    mara.send({ type: 'word.choose', index: 0 });
    await noa.until(() => noa.lastState?.phase === 'drawing', 'drawing');

    noa.send({ type: 'draw.op', op: { type: 'clear' } });
    await noa.until(() => noa.errors.includes('not_allowed'), 'not_allowed');
    noa.sendRaw('not json');
    await noa.until(() => noa.errors.includes('bad_request'), 'bad_request');
    for (let count = 0; count < 95; count += 1)
      mara.send({ type: 'draw.op', op: { type: 'clear' } });
    await mara.until(() => mara.errors.filter((code) => code === 'rate_limited').length === 5);

    const points = await probe.metrics();
    const messages = 'kritzel.ws.messages';
    expect(
      total(points, messages, { 'kritzel.ws.message.type': 'join', 'kritzel.outcome': 'accepted' }),
    ).toBe(2);
    expect(
      total(points, messages, {
        'kritzel.ws.message.type': 'draw.op',
        'kritzel.outcome': 'accepted',
      }),
    ).toBe(90);
    expect(
      total(points, messages, {
        'kritzel.ws.message.type': 'draw.op',
        'kritzel.outcome': 'rejected',
      }),
    ).toBe(6);
    expect(
      total(points, messages, {
        'kritzel.ws.message.type': 'invalid',
        'kritzel.outcome': 'rejected',
      }),
    ).toBe(1);
    const rejected = 'kritzel.messages.rejected';
    expect(total(points, rejected, { 'kritzel.reason': 'not_allowed' })).toBe(1);
    expect(total(points, rejected, { 'kritzel.reason': 'bad_request' })).toBe(1);
    expect(total(points, rejected, { 'kritzel.reason': 'rate_limited' })).toBe(5);
    expect(total(points, 'kritzel.rate_limit.hits', { 'kritzel.scope': 'draw' })).toBe(5);
  });

  it('AC-015-12: message, join and relay durations are recorded with the documented buckets', async () => {
    await start();
    const { clients } = await room('Mara', 'Noa');
    const [mara, noa] = clients as [TestClient, TestClient];
    mara.send({ type: 'game.start' });
    await mara.next('word.choices');
    mara.send({ type: 'word.choose', index: 0 });
    await noa.until(() => noa.lastState?.phase === 'drawing', 'drawing');
    mara.send({ type: 'draw.op', op: { type: 'clear' } });
    await noa.next('draw.op');

    const points = await probe.metrics();
    expect(
      total(points, 'kritzel.ws.message.duration', { 'kritzel.ws.message.type': 'join' }),
    ).toBe(2);
    expect(
      total(points, 'kritzel.ws.message.duration', { 'kritzel.ws.message.type': 'draw.op' }),
    ).toBe(1);
    expect(total(points, 'kritzel.join.duration', { 'kritzel.outcome': 'joined' })).toBe(2);
    const relay = points.find((point) => point.name === 'kritzel.drawing.relay.duration')!;
    expect(relay.value).toBe(1);
    expect(relay.unit).toBe('s');
    expect(relay.boundaries).toEqual([...DURATION_BUCKETS]);
  });

  it('AC-015-13: HTTP requests are measured by method, route template and status', async () => {
    await start();
    const code = await server.createRoom();
    await fetch(`${server.url}/api/rooms/${code}`);
    await fetch(`${server.url}/api/rooms/ZZZZZZ`);
    await fetch(`${server.url}/r/ABCDEF?invite=secret`);
    await fetch(`${server.url}/healthz`);

    const points = await probe.metrics();
    const http = 'http.server.request.duration';
    const of = (method: string, route: string, status: number) =>
      total(points, http, {
        'http.request.method': method,
        'http.route': route,
        'http.response.status_code': status,
      });
    expect(of('POST', '/api/rooms', 201)).toBe(1);
    expect(of('GET', '/api/rooms/:code', 200)).toBe(1);
    expect(of('GET', '/api/rooms/:code', 404)).toBe(1);
    expect(of('GET', 'unmatched', 404)).toBe(1);
    expect(of('GET', '/healthz', 200)).toBe(1);
    const labels = JSON.stringify(points.map((point) => point.labels));
    expect(labels).not.toContain('ABCDEF');
    expect(labels).not.toContain(code);
    expect(labels).not.toContain('secret');
  });

  it('AC-015-14: labels stay within their sets and the series count within budget under load', async () => {
    await start();
    const secrets: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      if (index === 9) server.clock.advance(60_000);
      const names = [`Host${index}`, `Guest${index}`];
      const { code, clients } = await room(...names);
      secrets.push(code, ...names, ...clients.map((client) => client.lastState!.you.id));
      await playGame(clients);
    }

    const points = await probe.metrics();
    expect(total(points, 'kritzel.games.completed')).toBe(12);
    expect(points.length).toBeLessThanOrEqual(SERIES_BUDGET);
    const labels = JSON.stringify(points.map((point) => point.labels));
    for (const secret of secrets) expect(labels).not.toContain(secret);
  }, 30_000);
});

describe('spans (spec 015)', () => {
  it('AC-015-16: operations produce named spans under the request or message that caused them', async () => {
    await start();
    const { code, clients } = await room('Mara', 'Noa');
    const [mara, noa] = clients as [TestClient, TestClient];
    const token = noa.of('joined')[0]!.sessionToken;
    noa.close();
    await mara.until(
      () => mara.lastState?.participants.find((p) => p.nickname === 'Noa')?.connected === false,
    );
    const back = await server.connect();
    await back.join(code, 'Noa', { sessionToken: token });
    await playGame([mara, back]);

    const spans = probe.spans();
    const named = (name: string) => spans.filter((span) => span.name === name);
    const parentOf = (name: string) => {
      const span = named(name)[0]!;
      return spans.find((other) => other.spanContext().spanId === span.parentSpanContext?.spanId);
    };
    expect(named('room.create')).toHaveLength(1);
    expect(parentOf('room.create')?.name).toBe('POST /api/rooms');
    expect(named('room.join')).toHaveLength(2);
    expect(parentOf('room.join')?.name).toBe('ws join');
    expect(named('room.reconnect')).toHaveLength(1);
    expect(parentOf('room.reconnect')?.name).toBe('ws join');
    expect(named('game.start')).toHaveLength(1);
    expect(parentOf('game.start')?.name).toBe('ws game.start');
    expect(named('guess.evaluate')).toHaveLength(2);
    expect(parentOf('guess.evaluate')?.name).toBe('ws chat.send');
    expect(named('game.end')).toHaveLength(1);
    expect(named('game.end')[0]!.parentSpanContext).toBeUndefined();

    const allowed = /^(kritzel\.|http\.|error\.type$)/;
    for (const span of spans) {
      for (const key of Object.keys(span.attributes)) expect(key).toMatch(allowed);
      expect(span.status.code).not.toBe(SpanStatusCode.ERROR);
    }
  });

  it('AC-015-17: one drawing operation in 64 produces a span', async () => {
    await start();
    const { clients } = await room('Mara', 'Noa');
    const [mara, noa] = clients as [TestClient, TestClient];
    mara.send({ type: 'game.start' });
    await mara.next('word.choices');
    mara.send({ type: 'word.choose', index: 0 });
    await noa.until(() => noa.lastState?.phase === 'drawing', 'drawing');

    const fill = { type: 'fill', x: 10, y: 10, color: '#2F6BFF' } as const;
    for (let batch = 1; batch <= 8; batch += 1) {
      for (let count = 0; count < 80; count += 1) mara.send({ type: 'draw.op', op: fill });
      await noa.until(() => noa.of('draw.op').length === batch * 80, `batch ${batch}`, 5_000);
      server.clock.advance(1_000);
    }

    const relays = probe.spans().filter((span) => span.name === 'drawing.relay');
    expect(relays).toHaveLength(640 / DRAW_SPAN_SAMPLE_EVERY);
    expect(probe.spans().filter((span) => span.name === 'ws draw.op')).toHaveLength(10);
    const points = await probe.metrics();
    expect(total(points, 'kritzel.drawing.relay.duration')).toBe(640);
  });
});

describe('logs and privacy (spec 015)', () => {
  it('AC-015-18, AC-015-19: log lines carry the trace ids; exported records only allowlisted attributes', async () => {
    probe = createTestTelemetry();
    const lines: Record<string, unknown>[] = [];
    const log = createLogger('info', probe.telemetry, (line) => lines.push(JSON.parse(line)));
    server = await startTestServer({ telemetry: probe.telemetry, log });
    const code = await server.createRoom();

    const line = lines.find((entry) => entry.msg === 'room created')!;
    expect(line.room).toBe(code);
    expect(line.trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(line.span_id).toMatch(/^[0-9a-f]{16}$/);
    expect(typeof line.time).toBe('string');

    const record = probe.logs().find((entry) => entry.body === 'room created')!;
    expect(record.spanContext?.traceId).toBe(line.trace_id);
    expect(record.spanContext?.spanId).toBe(line.span_id);
    expect(record.severityText).toBe('INFO');
    expect(record.severityNumber).toBe(9);
    expect(record.hrTime[0]).toBeGreaterThan(1_600_000_000);
    expect(record.attributes).toEqual({ rooms: 1 });
    expect(JSON.stringify(record.attributes)).not.toContain(code);
    const span = probe.spans().find((entry) => entry.name === 'room.create')!;
    expect(span.spanContext().spanId).toBe(line.span_id);
  });

  it('AC-015-20: sentinel player data never reaches exported metrics, spans or logs', async () => {
    probe = createTestTelemetry();
    const log = createLogger('debug', probe.telemetry, () => undefined);
    server = await startTestServer({
      telemetry: probe.telemetry,
      log,
      words: () => ['sentinelword', 'sentinelword', 'sentinelword'],
    });
    const code = await server.createRoom();
    const mara = await server.connect();
    const noa = await server.connect();
    const maraJoined = await mara.join(code, 'SentinelNick');
    await noa.join(code, 'SentinelGuest');
    mara.send({
      type: 'settings.update',
      settings: { rounds: 1, customWords: ['sentinelcustom', 'sentinelother'] },
    });
    mara.send({ type: 'chat.send', text: 'sentinel-chat-text' });
    await playGame([mara, noa]);
    noa.send({ type: 'chat.send', text: 'sentinel-after-game' });
    noa.sendRaw('sentinel-raw-frame');
    await noa.until(() => noa.errors.includes('bad_request'));
    await fetch(`${server.url}/r/${code}?sentinelquery=1`);

    const exported = JSON.stringify({
      metrics: await probe.metrics(),
      spans: probe.spans().map((span) => ({ name: span.name, attributes: span.attributes })),
      logs: probe.logs().map((record) => ({ body: record.body, attributes: record.attributes })),
    });
    expect(probe.logs().length).toBeGreaterThan(3);
    for (const secret of [
      'SentinelNick',
      'SentinelGuest',
      'sentinelword',
      'sentinelcustom',
      'sentinel-chat-text',
      'sentinel-after-game',
      'sentinel-raw-frame',
      'sentinelquery',
      maraJoined.sessionToken,
      maraJoined.participantId,
      code,
    ]) {
      expect(exported).not.toContain(secret);
    }
  });
});
