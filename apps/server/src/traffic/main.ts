import { fillServer, playGame } from './play.js';
import { planGame } from './plan.js';

/**
 * Traffic generator (spec 015, "Synthetic traffic"): plays complete games
 * against a running server. It ships in the image next to the server:
 *
 *   node traffic.js --url http://kritzel:3000 [--rooms 2] [--players 3]
 *                   [--seed 1] [--games 0] [--pace 400] [--scenario play|server-full]
 *                   [--seconds 300]
 *
 * `--games 0` plays until stopped. With `--games N` it exits 0 only when
 * every game reached the results screen, which makes it a smoke test.
 * Progress is written as JSON lines; the generator exports no telemetry.
 */
const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index]!.replace(/^--/, ''), process.argv[index + 1] ?? '');
}
const number = (name: string, fallback: number) => {
  const value = Number(args.get(name) ?? process.env[`TRAFFIC_${name.toUpperCase()}`] ?? fallback);
  if (!Number.isFinite(value) || value < 0) {
    console.error(`--${name} must be a non-negative number`);
    process.exit(2);
  }
  return value;
};

const url = args.get('url') ?? process.env.TRAFFIC_URL ?? 'http://127.0.0.1:3000';
const rooms = number('rooms', 2);
const players = Math.max(2, number('players', 3));
const seed = number('seed', 1);
const games = number('games', 0);
const paceMs = number('pace', 400);
const scenario = args.get('scenario') ?? process.env.TRAFFIC_SCENARIO ?? 'play';

const log = (event: string, context: Record<string, unknown> = {}) =>
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      service: 'kritzel-traffic',
      event,
      ...context,
    }),
  );

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    stopping = true;
    log('stopping', { signal });
  });
}

if (scenario === 'server-full') {
  await fillServer({ url, paceMs, log }, number('seconds', 300));
  process.exit(0);
}

log('starting', { rooms, players, seed, games, paceMs });
let failed = 0;
let played = 0;
/** One lane plays games one after another; lanes run side by side. */
async function lane(index: number): Promise<void> {
  for (let game = 0; !stopping && (games === 0 || game < games); game += 1) {
    const plan = planGame(seed + index * 1000 + game, players);
    try {
      const result = await playGame(plan, { url, paceMs, log });
      played += 1;
      if (!result.completed) failed += 1;
      log('game finished', { lane: index, ...result });
    } catch (error) {
      failed += 1;
      log('game failed', {
        lane: index,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      // Do not hammer a server that is down or restarting.
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    // Stay below the room-creation limit of ten per minute and address.
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(paceMs, (rooms * 60_000) / 8 / 10)),
    );
  }
}
await Promise.all(Array.from({ length: rooms }, (_, index) => lane(index)));
log('done', { played, failed });
process.exit(failed === 0 ? 0 : 1);
