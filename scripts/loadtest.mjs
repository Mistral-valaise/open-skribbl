#!/usr/bin/env node
// Load test (spec 012, "Capacity check"): simulates rooms of players who
// draw and chat, and reports relay latency and dropped connections.
//
// Usage: node scripts/loadtest.mjs [--url http://127.0.0.1:3000] [--rooms 30]
//        [--players 8] [--seconds 60]
// Needs TRUST_PROXY=true on the server: each simulated player sends its own
// X-Forwarded-For address so room creation is not rate-limited as one client.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const WebSocket = require('ws');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, []),
);
const base = args.url ?? 'http://127.0.0.1:3000';
const ROOMS = Number(args.rooms ?? 30);
const PLAYERS = Number(args.players ?? 8);
const SECONDS = Number(args.seconds ?? 60);
const wsUrl = `${base.replace(/^http/, 'ws')}/ws`;

const latencies = [];
let opsSent = 0;
let opsReceived = 0;
let chatsSent = 0;
let unexpectedCloses = 0;
let errors = 0;
let stopping = false;

function connect(roomCode, name) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const player = { socket, name, id: null, state: null, choices: null };
    socket.on('open', () =>
      socket.send(
        JSON.stringify({
          type: 'join',
          protocolVersion: 1,
          roomCode,
          nickname: name,
          avatar: { body: 0, eyes: 0, mouth: 0, accessory: 0 },
          role: 'player',
          clientId: `load-${roomCode}-${name}`,
        }),
      ),
    );
    socket.on('message', (data) => {
      const message = JSON.parse(String(data));
      if (message.type === 'joined') {
        player.id = message.participantId;
        player.state = message.state;
        resolve(player);
      } else if (message.type === 'room.state') {
        player.state = message.state;
      } else if (message.type === 'word.choices') {
        socket.send(JSON.stringify({ type: 'word.choose', index: 0 }));
      } else if (message.type === 'draw.op' && message.op.type === 'stroke.start') {
        // The stroke id carries the send time of the op.
        const sentAt = Number(message.op.id);
        if (Number.isFinite(sentAt)) latencies.push(Date.now() - sentAt);
        opsReceived += 1;
      } else if (message.type === 'draw.op') {
        opsReceived += 1;
      } else if (message.type === 'error') {
        errors += 1;
      }
    });
    socket.on('close', () => {
      if (!stopping) unexpectedCloses += 1;
    });
    socket.on('error', reject);
  });
}

async function runRoom(index) {
  const response = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.0.${Math.floor(index / 250)}.${(index % 250) + 1}` },
  });
  if (!response.ok) throw new Error(`room ${index}: HTTP ${response.status}`);
  const { code } = await response.json();
  const players = [];
  for (let seat = 0; seat < PLAYERS; seat += 1) players.push(await connect(code, `P${seat}`));
  players[0].socket.send(JSON.stringify({ type: 'settings.update', settings: { rounds: 10 } }));
  players[0].socket.send(JSON.stringify({ type: 'game.start' }));

  const timer = setInterval(() => {
    for (const player of players) {
      const state = player.state;
      if (!state || state.phase !== 'drawing') continue;
      if (state.drawerId === player.id) {
        // One short stroke: start, three point batches, end (about 30 points per second).
        const id = String(Date.now());
        const x = 50 + Math.floor(Math.random() * 600);
        const y = 50 + Math.floor(Math.random() * 400);
        const send = (op) => {
          player.socket.send(JSON.stringify({ type: 'draw.op', op }));
          opsSent += 1;
        };
        send({ type: 'stroke.start', id, tool: 'brush', color: '#14151C', size: 8, x, y });
        for (let batch = 1; batch <= 3; batch += 1) {
          send({
            type: 'stroke.points',
            id,
            points: [x + batch * 5, y + batch * 3, x + batch * 6, y + batch * 4],
          });
        }
        send({ type: 'stroke.end', id });
      } else if (Math.random() < 0.1) {
        player.socket.send(
          JSON.stringify({
            type: 'chat.send',
            text: `guess ${Math.random().toString(36).slice(2, 8)}`,
          }),
        );
        chatsSent += 1;
      }
    }
  }, 500);
  return { players, timer };
}

const startedAt = Date.now();
const rooms = [];
for (let index = 0; index < ROOMS; index += 1) rooms.push(await runRoom(index));
console.log(
  `${ROOMS} rooms × ${PLAYERS} players connected in ${Date.now() - startedAt} ms; running ${SECONDS} s`,
);
await new Promise((resolve) => setTimeout(resolve, SECONDS * 1000));

stopping = true;
for (const room of rooms) {
  clearInterval(room.timer);
  for (const player of room.players) player.socket.close();
}
latencies.sort((a, b) => a - b);
const percentile = (p) =>
  latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;
const result = {
  rooms: ROOMS,
  playersPerRoom: PLAYERS,
  seconds: SECONDS,
  drawOpsSent: opsSent,
  drawOpsRelayed: opsReceived,
  expectedRelays: opsSent * (PLAYERS - 1),
  chatMessagesSent: chatsSent,
  relayLatencyMs: {
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: latencies.at(-1) ?? 0,
  },
  unexpectedCloses,
  errorMessages: errors,
};
console.log(JSON.stringify(result, null, 2));
process.exit(unexpectedCloses > 0 ? 1 : 0);
