import { PROTOCOL_VERSION, ROOM_CODE_ALPHABET } from '@kritzel/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from './testing/client.js';

let server: TestServer;
afterEach(() => server?.close());

describe('rooms over HTTP and WebSocket (spec 001)', () => {
  it('AC-001-01: POST /api/rooms returns distinct six-character codes from the allowed alphabet', async () => {
    server = await startTestServer();
    const first = await server.createRoom();
    const second = await server.createRoom();
    for (const code of [first, second]) {
      expect(code).toHaveLength(6);
      expect([...code].every((char) => ROOM_CODE_ALPHABET.includes(char))).toBe(true);
    }
    expect(first).not.toBe(second);
  });

  it('AC-001-03: a lower-case code with surrounding spaces enters the same room', async () => {
    server = await startTestServer();
    const code = await server.createRoom();
    const mara = await server.connect();
    const noa = await server.connect();
    await mara.join(code, 'Mara');
    const joined = await noa.join(`  ${code.toLowerCase()} `, 'Noa');
    expect(joined.state.code).toBe(code);
    expect(joined.state.participants.map((p) => p.nickname)).toEqual(['Mara', 'Noa']);
  });

  it('AC-001-04: joining an unknown code fails with room_not_found', async () => {
    server = await startTestServer();
    const client = await server.connect();
    await expect(client.join('ZZZZZZ', 'Mara')).rejects.toThrow('room_not_found');
    await client.until(() => client.closed, 'socket close');
    const lookup = await fetch(`${server.url}/api/rooms/ZZZZZZ`);
    expect(lookup.status).toBe(404);
  });

  it('AC-001-14: a room with no connected participant for five minutes is disposed', async () => {
    server = await startTestServer();
    const code = await server.createRoom();
    const mara = await server.connect();
    await mara.join(code, 'Mara');
    mara.close();
    await mara.until(() => mara.closed, 'socket close');
    await expect.poll(() => server.app.registry.get(code)?.state.seats[0]?.connId).toBeNull();

    server.clock.advance(5 * 60_000 - 1);
    expect(server.app.registry.get(code)).toBeDefined();
    server.clock.advance(1);
    expect(server.app.registry.get(code)).toBeUndefined();

    const late = await server.connect();
    await expect(late.join(code, 'Late')).rejects.toThrow('room_not_found');
  });

  it('a room nobody ever joins is disposed after five minutes', async () => {
    server = await startTestServer();
    const code = await server.createRoom();
    server.clock.advance(5 * 60_000);
    expect(server.app.registry.get(code)).toBeUndefined();
  });

  it('AC-012-03: with MAX_ROOMS=2 a third room is refused with server_full', async () => {
    server = await startTestServer({ maxRooms: 2 });
    await server.createRoom();
    await server.createRoom();
    const response = await fetch(`${server.url}/api/rooms`, { method: 'POST' });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'server_full' });
  });

  it('room creation is rate-limited per address', async () => {
    server = await startTestServer();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await fetch(`${server.url}/api/rooms`, { method: 'POST' })).status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('proxy trust (spec 012)', () => {
  const create = (forwardedFor: string) =>
    fetch(`${server.url}/api/rooms`, {
      method: 'POST',
      headers: { 'x-forwarded-for': forwardedFor },
    });

  it('AC-016-15: behind a listed proxy the address the proxy appended counts, not one the client claims', async () => {
    // The test client connects from 127.0.0.1, which plays the proxy here.
    server = await startTestServer({ trustProxy: ['127.0.0.1'] });
    const statuses: number[] = [];
    // The client invents a new first address for every request; the proxy appends the real one.
    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await create(`198.51.100.${attempt}, 203.0.113.7`)).status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
    // Another visitor behind the same proxy has a budget of their own.
    expect((await create('198.51.100.1, 203.0.113.8')).status).toBe(201);
  });

  it('AC-016-15: a client that is not a listed proxy cannot choose its address', async () => {
    server = await startTestServer({ trustProxy: ['10.128.0.0/14'] });
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await create(`198.51.100.${attempt}`)).status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('AC-016-15: with blanket trust the claimed address is believed, which is why a list is safer', async () => {
    server = await startTestServer({ trustProxy: true });
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await create(`198.51.100.${attempt}, 203.0.113.7`)).status);
    }
    expect(statuses.every((status) => status === 201)).toBe(true);
  });
});

describe('gateway (architecture §4)', () => {
  it('refuses a client with another protocol version', async () => {
    server = await startTestServer();
    const code = await server.createRoom();
    const client = await server.connect();
    await expect(
      client.join(code, 'Mara', { protocolVersion: PROTOCOL_VERSION + 1 }),
    ).rejects.toThrow('version_mismatch');
  });

  it('answers malformed, unknown and premature messages with bad_request and stays up', async () => {
    server = await startTestServer();
    const code = await server.createRoom();
    const client = await server.connect();
    client.sendRaw('not json');
    client.sendRaw(JSON.stringify({ type: 'does.not.exist' }));
    client.sendRaw(JSON.stringify({ type: 'chat.send', text: 'before joining' }));
    client.sendRaw(JSON.stringify({ type: 'join', roomCode: code }));
    client.sendRaw('x'.repeat(33 * 1024));
    await client.until(() => client.errors.length === 5, 'five errors');
    expect(client.errors).toEqual(Array(5).fill('bad_request'));

    const joined = await client.join(code, 'Mara');
    expect(joined.state.phase).toBe('lobby');
  });

  it('closes a connection that keeps sending rejected messages', async () => {
    server = await startTestServer();
    const client = await server.connect();
    for (let count = 0; count < 50; count += 1) client.sendRaw('junk');
    await client.until(() => client.closed, 'socket close');
    expect(client.errors).toHaveLength(50);
  });
});

describe('a game over the wire', () => {
  async function twoPlayerGame() {
    server = await startTestServer();
    const code = await server.createRoom();
    const mara = await server.connect();
    const noa = await server.connect();
    await mara.join(code, 'Mara');
    await noa.join(code, 'Noa');
    mara.send({ type: 'game.start' });
    const choices = await mara.next('word.choices');
    mara.send({ type: 'word.choose', index: 0 });
    await noa.until(() => noa.lastState?.phase === 'drawing', 'drawing phase');
    return { mara, noa, word: choices.words[0]! };
  }

  it('AC-002-06: the secret word never reaches a guesser before they guess', async () => {
    const { mara, noa, word } = await twoPlayerGame();
    mara.send({ type: 'chat.send', text: 'drawer talking' });
    noa.send({ type: 'chat.send', text: 'wrong guess' });
    await mara.until(() =>
      mara.of('chat.message').some((m) => m.kind === 'chat' && m.text === 'wrong guess'),
    );

    expect(noa.lastState?.mask).toBe('_'.repeat(word.length));
    expect(JSON.stringify(noa.messages)).not.toContain(word);
    expect(mara.lastState?.word).toBe(word);
  });

  it('AC-003-01, AC-003-02: draw ops reach the other participant; a guesser cannot draw', async () => {
    const { mara, noa } = await twoPlayerGame();
    const op = { type: 'fill', x: 400, y: 300, color: '#2F6BFF' } as const;
    mara.send({ type: 'draw.op', op });
    expect((await noa.next('draw.op')).op).toEqual(op);

    noa.send({ type: 'draw.op', op });
    await noa.until(() => noa.errors.includes('not_allowed'), 'not_allowed');
    expect(mara.of('draw.op')).toHaveLength(0);
  });

  it('AC-003-03: an op with invalid values is dropped at the gateway', async () => {
    const { mara, noa } = await twoPlayerGame();
    mara.sendRaw(
      JSON.stringify({ type: 'draw.op', op: { type: 'fill', x: 900, y: 10, color: '#2F6BFF' } }),
    );
    await mara.until(() => mara.errors.includes('bad_request'), 'bad_request');
    expect(noa.of('draw.op')).toHaveLength(0);
  });

  it('AC-004-17: a sixth message within one second is dropped with rate_limited', async () => {
    const { mara, noa } = await twoPlayerGame();
    for (let count = 1; count <= 6; count += 1)
      noa.send({ type: 'chat.send', text: `guess ${count}` });
    await noa.until(() => noa.errors.includes('rate_limited'), 'rate_limited');
    await mara.until(() => mara.of('chat.message').filter((m) => m.kind === 'chat').length === 5);
    expect(mara.of('chat.message').flatMap((m) => (m.kind === 'chat' ? [m.text] : []))).toEqual(
      [1, 2, 3, 4, 5].map((count) => `guess ${count}`),
    );

    server.clock.advance(1_000);
    noa.send({ type: 'chat.send', text: 'after a second' });
    await mara.until(() =>
      mara.of('chat.message').some((m) => m.kind === 'chat' && m.text === 'after a second'),
    );
  });

  it('AC-002-08, AC-005-07: a correct guess ends the turn and scores, then the game runs to the results', async () => {
    const { mara, noa, word } = await twoPlayerGame();
    noa.send({ type: 'chat.send', text: word });
    await noa.until(() => noa.lastState?.phase === 'turnEnd', 'turn end');
    expect(noa.lastState?.turnEnd?.reason).toBe('all_guessed');
    // The drawer earns half of the guesser's 550 (spec 005).
    expect(noa.lastState?.participants.map((p) => p.score)).toEqual([275, 550]);

    server.clock.advance(6_000);
    const choices = await noa.next('word.choices');
    noa.send({ type: 'word.choose', index: 1 });
    await mara.until(() => mara.lastState?.phase === 'drawing', 'second turn');
    expect(mara.lastState?.drawerId).toBe(noa.lastState?.you.id);
    expect(choices.words).not.toContain(word);
  });

  it('AC-007-17: on shutdown every client is told before its connection closes', async () => {
    const { mara, noa } = await twoPlayerGame();
    await server.app.server.close();
    await mara.until(() => mara.closed, 'close');
    await noa.until(() => noa.closed, 'close');
    expect(mara.of('server.shutdown')).toHaveLength(1);
    expect(noa.of('server.shutdown')).toHaveLength(1);
  });
});

describe('word language (spec 006)', () => {
  it('AC-006-06, AC-006-19: offered words come from the list of the room language and difficulty', async () => {
    server = await startTestServer({ words: undefined });
    const { loadWordLists } = await import('@kritzel/content');
    const easyGerman = loadWordLists().get('de', 'easy');

    const response = await fetch(`${server.url}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'en' }),
    });
    const { code } = (await response.json()) as { code: string };
    const mara = await server.connect();
    const noa = await server.connect();
    await mara.join(code, 'Mara');
    await noa.join(code, 'Noa');
    mara.send({
      type: 'settings.update',
      settings: { language: 'de', difficulty: 'easy', wordChoices: 5 },
    });
    await noa.until(() => noa.lastState?.settings.language === 'de', 'settings');
    mara.send({ type: 'game.start' });
    const choices = await mara.next('word.choices');

    expect(choices.words).toHaveLength(5);
    expect(choices.words.every((word) => easyGerman.includes(word))).toBe(true);
  });
});
