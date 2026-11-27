import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import {
  chooseFirstWord,
  createRoom,
  drawStroke,
  ink,
  joinRoom,
  newParticipant,
  sendChat,
} from './helpers.js';

/**
 * Checks of the container image (spec 012). They run only against an
 * instance started outside the test run:
 *
 *   KRITZEL_E2E_URL=http://127.0.0.1:3000 KRITZEL_CONTAINER=kritzel pnpm e2e
 *
 * and, behind a TLS reverse proxy, with an https URL. CI does both.
 */
const url = process.env.KRITZEL_E2E_URL;
const container = process.env.KRITZEL_CONTAINER;

test.describe('container image', () => {
  test.skip(!url || !container, 'needs KRITZEL_E2E_URL and KRITZEL_CONTAINER');

  test('AC-012-01, AC-012-15: the image serves the app and the health endpoint with no configuration', async ({
    page,
    request,
  }) => {
    const health = await request.get('/healthz');
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });

    await page.goto('/');
    await expect(page).toHaveTitle('Kritzel');
    await expect(page.getByTestId('create-room')).toBeVisible();
  });

  test('AC-012-08: the process in the container does not run as root', () => {
    const uid = execFileSync('docker', ['exec', container!, 'id', '-u'], {
      encoding: 'utf8',
    }).trim();
    expect(Number(uid)).toBeGreaterThan(0);
  });
});

test.describe('behind a TLS reverse proxy', () => {
  test.skip(!url?.startsWith('https://'), 'needs an https KRITZEL_E2E_URL');

  test('AC-012-09: a game is playable through a proxy that terminates TLS', async ({ browser }) => {
    const host = await newParticipant(browser, { ignoreHTTPSErrors: true });
    const guest = await newParticipant(browser, { ignoreHTTPSErrors: true });
    const sockets: string[] = [];
    host.on('websocket', (socket) => sockets.push(socket.url()));

    const code = await createRoom(host, 'Mara');
    await joinRoom(guest, code, 'Noa');
    expect(sockets.every((socket) => socket.startsWith('wss://'))).toBe(true);
    expect(sockets.length).toBeGreaterThan(0);

    await host.getByTestId('start-game').click();
    const word = await chooseFirstWord(host);
    await drawStroke(host, [0.2, 0.3], [0.7, 0.6]);
    await expect.poll(async () => (await ink(guest)).count).toBeGreaterThan(500);
    await sendChat(guest, word);
    await expect(guest.getByTestId('turn-end')).toBeVisible();
    await expect(guest.getByTestId('turn-end-word')).toContainText(word);
  });
});
