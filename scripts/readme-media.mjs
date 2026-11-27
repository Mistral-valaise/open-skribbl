#!/usr/bin/env node
// Plays a real game in four browsers and captures the pictures the README
// and the promo film use. Nothing is mocked: the server is the real one and
// every stroke, guess and score comes from the game.
//
// Usage:
//   node scripts/readme-media.mjs                  screenshots into docs/assets/readme
//   node scripts/readme-media.mjs --clips <dir>    also records clips (needs ffmpeg)
//
// Options:
//   --out <dir>    where the screenshots go (default docs/assets/readme)
//   --url <url>    use a running instance instead of starting one
//
// The clips are the source footage of marketing/promo; each comes with a
// JSON file of named moments (seconds from the first frame).
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const out = resolve(root, option('out', 'docs/assets/readme'));
const clips = option('clips') ? resolve(root, option('clips')) : undefined;
const port = 3997;
const external = option('url');
const base = external ?? `http://127.0.0.1:${port}`;
/** Clips to encode once the game is over, by name: a later recording replaces an earlier one. */
const encodings = new Map();

/** The word of the film and nine others: `customWordsOnly` needs ten (spec 006). */
const WORD = 'lighthouse';
const WORDS = [WORD, 'windmill', 'sailboat', 'campfire', 'umbrella', 'anchor'].concat([
  'compass',
  'treasure',
  'volcano',
  'igloo',
]);

/** 1280 × 720 at 1.5 gives frames of 1920 × 1080, the size of the film. */
const DESKTOP = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 };
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};
/** What an open keyboard leaves of the phone's height. */
const PHONE_TYPING = { width: 390, height: 508 };

async function startServer() {
  if (external) return () => {};
  execFileSync('pnpm', ['--filter', '@kritzel/web', 'build'], { cwd: root, stdio: 'ignore' });
  const server = spawn('pnpm', ['--filter', '@kritzel/server', 'exec', 'tsx', 'src/main.ts'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: 'ignore',
    detached: true,
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const up = await fetch(`${base}/healthz`).then(
      (response) => response.ok,
      () => false,
    );
    if (up) return () => process.kill(-server.pid);
    await sleep(500);
  }
  process.kill(-server.pid);
  throw new Error('the server did not start');
}

/**
 * Records a page as a series of screenshots, each with its time; ffmpeg turns
 * them into a clip with a constant frame rate. The browser's own screencast
 * would be simpler, but it delivers frames at CSS size, not at device size.
 */
async function record(page, name) {
  if (!clips) return { mark() {}, async stop() {} };
  const dir = join(clips, `${name}-frames`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  const marks = {};
  let running = true;
  const loop = (async () => {
    while (running) {
      const at = Date.now() / 1000;
      const file = join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
      const taken = await page
        .screenshot({
          path: file,
          type: 'jpeg',
          quality: 92,
          animations: 'allow',
          caret: 'initial',
        })
        .then(
          () => true,
          () => false,
        );
      if (!taken) break;
      frames.push({ file, at });
      const rest = 1 / 30 - (Date.now() / 1000 - at);
      if (rest > 0) await sleep(rest * 1000);
    }
  })();
  return {
    /** Names the present moment, so the film can cut on it. */
    mark(label) {
      marks[label] = Date.now() / 1000;
    },
    async stop() {
      await sleep(400);
      running = false;
      await loop;
      const end = Date.now() / 1000;
      encodings.set(name, () => encode(name, dir, frames, marks, end));
    },
  };
}

/** Turns the frames of one recording into a clip; done after the game, because it takes a while. */
function encode(name, dir, frames, marks, end) {
  const start = frames[0].at;
  const list = ['ffconcat version 1.0'];
  frames.forEach((frame, index) => {
    const next = index + 1 < frames.length ? frames[index + 1].at : end;
    list.push(`file '${frame.file}'`, `duration ${Math.max(next - frame.at, 0.001).toFixed(4)}`);
  });
  list.push(`file '${frames.at(-1).file}'`);
  writeFileSync(join(dir, 'frames.txt'), `${list.join('\n')}\n`);
  execFileSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'frames.txt')]
      .concat(['-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p'])
      .concat(['-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-g', '15'])
      .concat(['-movflags', '+faststart', join(clips, `${name}.mp4`)]),
  );
  const moments = Object.fromEntries(
    Object.entries(marks).map(([label, at]) => [label, Number((at - start).toFixed(2))]),
  );
  moments.duration = Number((end - start).toFixed(2));
  writeFileSync(join(clips, `${name}.json`), `${JSON.stringify(moments, null, 2)}\n`);
  rmSync(dir, { recursive: true, force: true });
  console.log('clip', name, `${moments.duration}s`, `${frames.length} frames`);
}

async function shot(page, name) {
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log('shot', name);
}

async function participant(browser, options, theme = 'dark') {
  const context = await browser.newContext({ locale: 'en-US', colorScheme: theme, ...options });
  // The stored choice wins over the system's colour scheme (spec 011).
  await context.addInitScript(`localStorage.setItem('kritzel.theme', ${JSON.stringify(theme)});`);
  return context.newPage();
}

async function joinRoom(page, code, nickname) {
  await page.goto(`${base}/r/${code}`);
  await page.getByTestId('nickname-input').fill(nickname);
  await page.getByTestId('join-room').click();
  await page.getByTestId('lobby').waitFor();
}

async function say(page, text, pace = 0) {
  const input = page.getByTestId('chat-input');
  if (pace > 0) await input.pressSequentially(text, { delay: pace });
  else await input.fill(text);
  await input.press('Enter');
}

/** A small repeatable wobble, so lines look drawn by hand and every run is the same. */
let seed = 7;
function wobble(amount) {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return (seed / 4294967296 - 0.5) * 2 * amount;
}

/** Draws through points given as fractions of the canvas, at the speed of a hand. */
async function draw(page, points, { speed = 1 } = {}) {
  const box = await page.getByTestId('canvas').boundingBox();
  const at = ([x, y]) => [box.x + box.width * x, box.y + box.height * y];
  const [startX, startY] = at(points[0]);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let index = 1; index < points.length; index += 1) {
    const [fromX, fromY] = at(points[index - 1]);
    const [toX, toY] = at(points[index]);
    const steps = Math.max(2, Math.round(Math.hypot(toX - fromX, toY - fromY) / (9 * speed)));
    for (let step = 1; step <= steps; step += 1) {
      const last = step === steps;
      const x = fromX + ((toX - fromX) * step) / steps + (last ? 0 : wobble(0.9));
      const y = fromY + ((toY - fromY) * step) / steps + (last ? 0 : wobble(0.9));
      await page.mouse.move(x, y);
      await sleep(11);
    }
  }
  await page.mouse.up();
  await sleep(140);
}

async function fill(page, color, [x, y]) {
  await page.getByTestId('tool-fill').click();
  await page.getByTestId(`color-${color}`).click();
  const box = await page.getByTestId('canvas').boundingBox();
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await page.getByTestId('tool-brush').click();
  await sleep(220);
}

async function brush(page, color, size) {
  await page.getByTestId('tool-brush').click();
  await page.getByTestId(`color-${color}`).click();
  await page.getByTestId(`size-${size}`).click();
}

/** A sine wave from left to right, for the sea. */
function wave(fromX, toX, y, height, count) {
  const points = [];
  for (let index = 0; index <= count * 8; index += 1) {
    const progress = index / (count * 8);
    points.push([
      fromX + (toX - fromX) * progress,
      y + Math.sin(progress * count * 2 * Math.PI) * height,
    ]);
  }
  return points;
}

const INK = '14151C';
const RED = 'E5383B';
const YELLOW = 'FFC53D';
const LAMP = 'FFE873';
const BLUE = '2F6BFF';
const SKY = '4DB8FF';

/**
 * The lighthouse, as groups of strokes. After each group the script lets
 * someone guess, so the chat fills while the picture grows.
 */
const LIGHTHOUSE = [
  async (page) => {
    await brush(page, INK, 8);
    // The tower: a closed outline, so it can be filled.
    await draw(page, [
      [0.42, 0.8],
      [0.46, 0.36],
      [0.56, 0.36],
      [0.6, 0.8],
      [0.42, 0.8],
    ]);
    await draw(page, [
      [0.438, 0.5],
      [0.582, 0.5],
    ]);
    await draw(page, [
      [0.426, 0.65],
      [0.594, 0.65],
    ]);
  },
  async (page) => {
    await fill(page, RED, [0.51, 0.43]);
    await fill(page, RED, [0.51, 0.72]);
  },
  async (page) => {
    await brush(page, INK, 8);
    // The gallery, the lamp room and the roof.
    await draw(page, [
      [0.435, 0.36],
      [0.585, 0.36],
    ]);
    await draw(page, [
      [0.475, 0.36],
      [0.475, 0.27],
      [0.545, 0.27],
      [0.545, 0.36],
    ]);
    await draw(page, [
      [0.455, 0.27],
      [0.51, 0.19],
      [0.565, 0.27],
      [0.455, 0.27],
    ]);
    await fill(page, LAMP, [0.51, 0.32]);
    await fill(page, RED, [0.51, 0.245]);
  },
  async (page) => {
    await brush(page, BLUE, 8);
    await draw(page, wave(0.06, 0.4, 0.84, 0.018, 4), { speed: 1.4 });
    await draw(page, wave(0.62, 0.94, 0.84, 0.018, 4), { speed: 1.4 });
    await brush(page, SKY, 8);
    await draw(page, wave(0.12, 0.38, 0.92, 0.014, 3), { speed: 1.4 });
    await draw(page, wave(0.58, 0.88, 0.92, 0.014, 3), { speed: 1.4 });
  },
  async (page) => {
    await brush(page, YELLOW, 14);
    for (const [from, to] of [
      [
        [0.455, 0.3],
        [0.2, 0.2],
      ],
      [
        [0.455, 0.33],
        [0.2, 0.4],
      ],
      [
        [0.565, 0.3],
        [0.82, 0.2],
      ],
      [
        [0.565, 0.33],
        [0.82, 0.4],
      ],
    ]) {
      await draw(page, [from, to], { speed: 1.3 });
    }
  },
  async (page) => {
    await brush(page, INK, 4);
    // Two gulls, drawn while a guess is being typed.
    for (const [x, y] of [
      [0.24, 0.58],
      [0.78, 0.62],
    ]) {
      await draw(page, [
        [x - 0.035, y - 0.012],
        [x - 0.016, y - 0.03],
        [x, y],
        [x + 0.016, y - 0.03],
        [x + 0.035, y - 0.012],
      ]);
    }
  },
];

/** A quick scribble for the turns the film does not show. */
async function scribble(page) {
  await draw(
    page,
    [
      [0.3, 0.4],
      [0.5, 0.25],
      [0.7, 0.4],
      [0.6, 0.7],
      [0.4, 0.7],
      [0.3, 0.4],
    ],
    { speed: 3 },
  );
}

/** Opens a room with four players; true when Mara draws and the word is on offer. */
async function openRoom(browser) {
  const mara = await participant(browser, DESKTOP);
  const noa = await participant(browser, PHONE);
  const jules = await participant(browser, DESKTOP, 'light');
  const aiko = await participant(browser, { viewport: { width: 1024, height: 720 } });
  await mara.goto(base);
  await mara.getByTestId('nickname-input').fill('Mara');
  await mara.getByTestId('create-room').click();
  await mara.getByTestId('lobby').waitFor();
  const code = (await mara.getByTestId('room-code').innerText()).replace(/\s/g, '');
  // The lobby fills while the film watches.
  const lobby = await record(mara, 'lobby');
  await sleep(700);
  for (const [page, nickname] of [
    [jules, 'Jules'],
    [noa, 'Noa'],
    [aiko, 'Aiko'],
  ]) {
    await joinRoom(page, code, nickname);
    lobby.mark(nickname.toLowerCase());
    await sleep(650);
  }
  await sleep(900);
  await shot(mara, 'lobby');
  await lobby.stop();
  return { mara, noa, jules, aiko, pages: [mara, noa, jules, aiko] };
}

async function close(room) {
  for (const page of room.pages) await page.context().close();
}

mkdirSync(out, { recursive: true });
if (clips) mkdirSync(clips, { recursive: true });
const stopServer = await startServer();
const browser = await chromium.launch();
try {
  // The home screen, before anyone has typed anything.
  const visitor = await participant(browser, DESKTOP);
  await visitor.goto(base);
  await visitor.getByTestId('create-room').waitFor();
  await shot(visitor, 'home');
  // The same screen in the four interface languages.
  const languages = await record(visitor, 'languages');
  await sleep(900);
  for (const language of ['de', 'es', 'fr', 'en']) {
    await visitor.getByTestId(`language-${language}`).click();
    languages.mark(language);
    await sleep(1100);
  }
  await languages.stop();
  await visitor.context().close();

  // A room in which Mara is offered the word; the choice is random, so this may take a few rooms.
  let room;
  let film;
  for (let attempt = 1; ; attempt += 1) {
    room = await openRoom(browser);
    const { mara } = room;
    await mara.getByTestId('setting-rounds').selectOption('1');
    await mara.getByTestId('setting-wordChoices').selectOption('5');
    await mara.getByTestId('setting-customWords').fill(WORDS.join(', '));
    await mara.getByTestId('setting-customWords').blur();
    await mara.getByTestId('setting-customWordsOnly').check();
    await sleep(300);
    film = await record(mara, 'draw');
    await mara.getByTestId('start-game').click();
    const offered = mara.getByTestId('word-choice').filter({ hasText: WORD });
    const found = await offered
      .first()
      .waitFor({ timeout: 4000 })
      .then(
        () => true,
        () => false,
      );
    if (found) {
      await sleep(900);
      film.mark('choose');
      await offered.first().click();
      break;
    }
    if (attempt === 8) throw new Error(`"${WORD}" was not offered in eight rooms`);
    await close(room);
    // Room creation is limited per address (architecture §4).
    await sleep(6500);
  }
  const { mara, noa, jules, aiko, pages } = room;
  await mara.getByTestId('word-display').waitFor();
  const phone = await record(noa, 'phone');
  const guesser = await record(jules, 'guess');
  await sleep(600);
  film.mark('drawing');

  // Turn 1, the one the film shows: guesses arrive while the lighthouse grows.
  await LIGHTHOUSE[0](mara);
  await say(jules, 'a tower?');
  await LIGHTHOUSE[1](mara);
  await say(aiko, 'candle');
  await say(noa, 'rocket!');
  await LIGHTHOUSE[2](mara);
  film.mark('lamp');
  await say(jules, 'windmill');
  await aiko.getByTestId('reaction-button').nth(3).click();
  await LIGHTHOUSE[3](mara);
  await say(aiko, 'lighthose');
  await LIGHTHOUSE[4](mara);
  film.mark('beams');
  await sleep(500);
  await shot(mara, 'game');
  await shot(jules, 'game-light');
  await shot(noa, 'phone');
  // Noa types on the phone: the keyboard takes the lower part of the screen.
  await phone.stop();
  await noa.setViewportSize(PHONE_TYPING);
  await noa.getByTestId('chat-input').click();
  const gulls = LIGHTHOUSE[5](mara);
  await sleep(700);
  await noa.getByTestId('chat-input').pressSequentially(WORD, { delay: 110 });
  await gulls;
  await shot(noa, 'phone-typing');
  film.mark('guess');
  guesser.mark('guess');
  await noa.getByTestId('chat-input').press('Enter');
  await sleep(1300);
  await noa.setViewportSize(PHONE.viewport);
  await noa
    .getByTestId('like-up')
    .click({ timeout: 2000 })
    .catch(() => {});
  await sleep(500);
  await say(jules, WORD, 70);
  await jules
    .getByTestId('like-up')
    .click({ timeout: 2000 })
    .catch(() => {});
  await sleep(1200);
  await aiko.getByTestId('reaction-button').nth(2).click();
  await sleep(1000);
  await say(aiko, WORD);
  film.mark('turn-end');
  guesser.mark('turn-end');
  await mara.getByTestId('turn-end').waitFor();
  await sleep(2500);
  await shot(mara, 'turn-end');
  await sleep(1500);
  await guesser.stop();
  await film.stop();

  // The other three turns, played quickly: whoever is offered words draws.
  for (let turn = 2; turn <= 4; turn += 1) {
    const offered = pages.map((page) =>
      page
        .getByTestId('word-choice')
        .first()
        .waitFor({ timeout: 12_000 })
        .then(() => page),
    );
    const drawer = await Promise.any(offered);
    await drawer.getByTestId('word-choice').first().click();
    const word = (await drawer.getByTestId('word-display').innerText()).trim();
    await scribble(drawer);
    // Different speeds give different scores, so the podium has an order.
    const guessers = pages.filter((page) => page !== drawer);
    const order = turn % 2 === 0 ? guessers : guessers.toReversed();
    for (const [index, page] of order.entries()) {
      await sleep(600 + index * 2600);
      await say(page, word);
    }
    await drawer.getByTestId('turn-end').waitFor();
    if (turn === 4) {
      const podium = await record(mara, 'podium');
      await mara.getByTestId('results').waitFor({ timeout: 20_000 });
      podium.mark('results');
      // The confetti lasts three seconds (design guideline §6); the pictures are taken after it.
      await sleep(3600);
      await shot(mara, 'results');
      await shot(noa, 'phone-results');
      await sleep(1500);
      await podium.stop();
    } else {
      await drawer.getByTestId('turn-end').waitFor({ state: 'hidden', timeout: 20_000 });
    }
  }
  await close(room);
  for (const run of encodings.values()) run();
} finally {
  await browser.close();
  stopServer();
}
