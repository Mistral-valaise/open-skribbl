import { expect, test } from '@playwright/test';
import {
  canvasPoint,
  chooseFirstWord,
  createRoom,
  drawStroke,
  ink,
  joinRoom,
  newParticipant,
  sendChat,
  setSetting,
} from './helpers.js';

test('AC-001-15, AC-001-16: invite link, join form and unknown room', async ({
  browser,
  baseURL,
}) => {
  const host = await newParticipant(browser, {
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const code = await createRoom(host, 'Mara');
  const link = `${baseURL}/r/${code}`;

  const invite = host.getByTestId('invite-link');
  const shown = (await invite.inputValue().catch(() => invite.innerText())).trim();
  expect(shown).toBe(link);
  await host.getByTestId('copy-link').click();
  await expect.poll(() => host.evaluate(() => navigator.clipboard.readText())).toBe(link);

  const guest = await newParticipant(browser);
  await guest.goto(`/r/${code}`);
  await expect(guest.getByTestId('join-room')).toBeVisible();
  await guest.getByTestId('nickname-input').fill('Noa');
  await guest.getByTestId('join-room').click();
  await expect(guest.getByTestId('lobby')).toBeVisible();
  await expect(host.getByTestId('player-row')).toHaveCount(2);
  await expect(host.getByTestId('player-row').nth(1)).toContainText('Noa');

  const lost = await newParticipant(browser);
  await lost.goto('/r/ZZZZZZ');
  await expect(lost.getByTestId('room-not-found')).toBeVisible();
});

test('a full game in two browsers (AC-002-08, AC-003-16, AC-004-16, AC-004-18, AC-011-15)', async ({
  browser,
  baseURL,
}) => {
  const host = await newParticipant(browser);
  const guest = await newParticipant(browser);
  const foreignRequests: string[] = [];
  for (const page of [host, guest]) {
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL!) && !/^(data|blob):/.test(url)) foreignRequests.push(url);
    });
    page.on('websocket', (socket) => {
      if (!socket.url().startsWith(baseURL!.replace('http', 'ws')))
        foreignRequests.push(socket.url());
    });
  }

  const code = await createRoom(host, 'Mara');
  await joinRoom(guest, code, 'Noa');
  await setSetting(host, 'rounds', '1');
  await expect(guest.getByTestId('setting-rounds')).toHaveValue('1');
  await host.getByTestId('start-game').click();

  // Turn 1: Mara draws, Noa guesses.
  await expect(guest.getByTestId('game')).toBeVisible();
  await expect(guest.getByTestId('round-indicator')).toContainText('1');
  const word = await chooseFirstWord(host);
  await expect(guest.getByTestId('word-mask')).toBeVisible();
  await expect(guest.getByTestId('word-display')).toHaveCount(0);
  await expect(guest.getByTestId('timer')).toBeVisible();

  // Only the drawer has the toolbar; the guesser's chat input has focus.
  await expect(host.getByTestId('toolbar')).toBeVisible();
  await expect(guest.getByTestId('toolbar')).toHaveCount(0);
  await expect(guest.getByTestId('chat-input')).toBeFocused();

  await drawStroke(host, [0.2, 0.3], [0.7, 0.6]);
  await expect.poll(async () => (await ink(guest)).count).toBeGreaterThan(500);

  // Markup is shown as text, and Enter keeps the focus in the input.
  await sendChat(guest, '<b>hi</b>');
  await expect(host.getByTestId('chat-log')).toContainText('<b>hi</b>');
  await expect(host.getByTestId('chat-log').locator('b')).toHaveCount(0);
  await expect(guest.getByTestId('chat-input')).toBeFocused();

  await sendChat(guest, word);
  await expect(guest.getByTestId('turn-end')).toBeVisible();
  await expect(guest.getByTestId('turn-end-word')).toContainText(word);
  const guestScore = host.getByTestId('score-row').filter({ hasText: 'Noa' });
  await expect
    .poll(async () => Number(await guestScore.getAttribute('data-score')))
    .toBeGreaterThan(500);

  // Turn 2: Noa draws on a fresh canvas, Mara guesses.
  await expect(guest.getByTestId('word-choice').first()).toBeVisible({ timeout: 15_000 });
  const second = await chooseFirstWord(guest);
  expect((await ink(host)).count).toBe(0);
  await expect(host.getByTestId('toolbar')).toHaveCount(0);
  await sendChat(host, second);
  await expect(host.getByTestId('turn-end')).toBeVisible();

  // Results, then back to the lobby.
  await expect(host.getByTestId('results')).toBeVisible({ timeout: 15_000 });
  await expect(guest.getByTestId('ranking-row')).toHaveCount(2);
  await host.getByTestId('play-again').click();
  await expect(guest.getByTestId('lobby')).toBeVisible();

  expect(foreignRequests).toEqual([]);
});

test('drawing tools (AC-003-13, AC-003-15) and reload (AC-007-10)', async ({ browser }) => {
  const host = await newParticipant(browser);
  const guest = await newParticipant(browser);
  const code = await createRoom(host, 'Mara');
  await joinRoom(guest, code, 'Noa');
  await host.getByTestId('start-game').click();
  await chooseFirstWord(host);

  // A click without movement draws a dot with the diameter of the selected size.
  await host.getByTestId('size-40').click();
  const centre = await canvasPoint(host, 0.5, 0.5);
  await host.mouse.click(centre.x, centre.y);
  const dot = await ink(host);
  expect(dot.canvasWidth).toBe(1600);
  expect(dot.canvasHeight).toBe(1200);
  const diameter = 40 * (dot.canvasWidth / 800);
  expect(Math.abs(dot.width - diameter)).toBeLessThanOrEqual(4);
  expect(Math.abs(dot.height - diameter)).toBeLessThanOrEqual(4);
  await expect.poll(async () => (await ink(guest)).count).toBeGreaterThan(1000);

  // Shortcuts work while the chat input is not focused …
  await host
    .getByTestId('canvas')
    .focus()
    .catch(() => undefined);
  await host.locator('body').press('e');
  await expect(host.getByTestId('tool-eraser')).toHaveAttribute('aria-pressed', 'true');
  await host.locator('body').press('b');
  await expect(host.getByTestId('tool-brush')).toHaveAttribute('aria-pressed', 'true');
  await host.locator('body').press('2');
  await expect(host.getByTestId('size-8')).toHaveAttribute('aria-pressed', 'true');
  await host.locator('body').press('Control+z');
  await expect.poll(async () => (await ink(guest)).count).toBe(0);
  expect((await ink(host)).count).toBe(0);
  await host.locator('body').press('Control+Shift+Z');
  await expect.poll(async () => (await ink(guest)).count).toBeGreaterThan(1000);

  // … and do nothing while typing in the chat.
  await host.getByTestId('chat-input').click();
  await host.getByTestId('chat-input').press('e');
  await host.getByTestId('chat-input').press('Control+z');
  await expect(host.getByTestId('tool-brush')).toHaveAttribute('aria-pressed', 'true');
  expect((await ink(host)).count).toBeGreaterThan(1000);

  // A reload returns the guesser to the same seat with the drawing intact.
  await guest.reload();
  await expect(guest.getByTestId('game')).toBeVisible();
  await expect.poll(async () => (await ink(guest)).count).toBeGreaterThan(1000);
  await expect(host.getByTestId('score-row')).toHaveCount(2);

  // The drawer can still redo an undone item after reloading.
  await host.getByTestId('undo').click();
  await expect.poll(async () => (await ink(guest)).count).toBe(0);
  await host.reload();
  await expect(host.getByTestId('toolbar')).toBeVisible();
  await host.getByTestId('redo').click();
  await expect.poll(async () => (await ink(guest)).count).toBeGreaterThan(1000);
  expect((await ink(host)).count).toBeGreaterThan(1000);
});

test('AC-003-14: touch drawing on a phone draws and does not scroll', async ({ browser }) => {
  const phone = await newParticipant(browser, {
    viewport: { width: 375, height: 740 },
    hasTouch: true,
    isMobile: true,
  });
  const guest = await newParticipant(browser);
  const code = await createRoom(phone, 'Mara');
  await joinRoom(guest, code, 'Noa');
  await phone.getByTestId('start-game').click();
  await chooseFirstWord(phone);

  await phone.getByTestId('canvas').scrollIntoViewIfNeeded();
  const scrollBefore = await phone.evaluate(() => window.scrollY);
  const from = await canvasPoint(phone, 0.3, 0.3);
  const to = await canvasPoint(phone, 0.7, 0.7);
  const session = await phone.context().newCDPSession(phone);
  const touch = (type: string, point?: { x: number; y: number }) =>
    session.send('Input.dispatchTouchEvent', {
      type: type as 'touchStart',
      touchPoints: point ? [{ x: Math.round(point.x), y: Math.round(point.y) }] : [],
    });
  await touch('touchStart', from);
  for (let step = 1; step <= 8; step += 1) {
    await touch('touchMove', {
      x: from.x + ((to.x - from.x) * step) / 8,
      y: from.y + ((to.y - from.y) * step) / 8,
    });
  }
  await touch('touchEnd');

  await expect.poll(async () => (await ink(guest)).count).toBeGreaterThan(500);
  expect(await phone.evaluate(() => window.scrollY)).toBe(scrollBefore);
});
