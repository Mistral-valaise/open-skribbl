import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  chooseFirstWord,
  createRoom,
  drawStroke,
  ink,
  joinRoom,
  newParticipant,
  sendChat,
  setSetting,
} from './helpers.js';

const avatarOf = (page: Page) =>
  page.getByTestId('avatar').first().getAttribute('data-avatar') as Promise<string>;

test('languages and avatars (AC-006-02, AC-010-07, AC-010-08, AC-010-10)', async ({ browser }) => {
  const host = await newParticipant(browser, { locale: 'en-US' });
  await host.goto('/');
  const english = await host.getByTestId('create-room').innerText();

  // Switching the language changes the visible strings at once and survives a reload.
  await host.getByTestId('language-de').click();
  await expect(host.getByTestId('create-room')).not.toHaveText(english);
  const german = await host.getByTestId('create-room').innerText();
  await expect(host.getByTestId('language-de')).toHaveAttribute('aria-pressed', 'true');
  await expect(host.locator('html')).toHaveAttribute('lang', 'de');
  await host.reload();
  await expect(host.getByTestId('create-room')).toHaveText(german);

  // The builder is keyboard operable: one control changes exactly one part.
  const before = (await avatarOf(host)).split('-');
  const nextEyes = host.getByTestId('avatar-next-eyes');
  await expect(nextEyes).toHaveAccessibleName(/.+/);
  await nextEyes.focus();
  await host.keyboard.press('Enter');
  const after = (await avatarOf(host)).split('-');
  expect(after[1]).not.toBe(before[1]);
  expect([after[0], after[2], after[3]]).toEqual([before[0], before[2], before[3]]);
  for (const part of ['body', 'eyes', 'mouth', 'accessory']) {
    await expect(host.getByTestId(`avatar-prev-${part}`)).toHaveAccessibleName(/.+/);
    await expect(host.getByTestId(`avatar-next-${part}`)).toHaveAccessibleName(/.+/);
  }
  await expect(host.getByTestId('avatar-random')).toHaveAccessibleName(/.+/);

  // Nickname and avatar are remembered …
  await host.getByTestId('nickname-input').fill('Mara');
  const chosen = await avatarOf(host);
  const code = await createRoom(host, 'Mara');
  const visit = await host.context().newPage();
  await visit.goto('/');
  await expect(visit.getByTestId('nickname-input')).toHaveValue('Mara');
  expect(await avatarOf(visit)).toBe(chosen);

  // … and other participants see exactly the chosen avatar.
  const guest = await newParticipant(browser, { locale: 'fr-FR' });
  await guest.goto(`/r/${code}`);
  await expect(guest.locator('html')).toHaveAttribute('lang', 'fr');
  await guest.getByTestId('nickname-input').fill('Noa');
  await guest.getByTestId('join-room').click();
  const hostRow = guest.getByTestId('player-row').filter({ hasText: 'Mara' });
  await expect(hostRow.getByTestId('avatar')).toHaveAttribute('data-avatar', chosen);
});

test('custom words, reactions, likes, results and PNG download (AC-008-10, AC-008-11)', async ({
  browser,
}) => {
  const host = await newParticipant(browser, { locale: 'en-US' });
  const guest = await newParticipant(browser, { locale: 'en-US' });
  const code = await createRoom(host, 'Mara');
  await joinRoom(guest, code, 'Noa');

  const custom = Array.from({ length: 10 }, (_, index) => `customword${'abcdefghij'[index]}`);
  await setSetting(host, 'rounds', '1');
  await host.getByTestId('setting-customWords').fill(custom.join(', '));
  await host.getByTestId('setting-customWords').blur();
  await host.getByTestId('setting-customWordsOnly').check();
  await expect(guest.getByTestId('lobby')).toContainText('10');
  await expect(guest.getByTestId('lobby')).not.toContainText('customworda');
  await host.getByTestId('start-game').click();

  // Turn 1: Mara draws one of the custom words.
  const word = await chooseFirstWord(host);
  expect(custom).toContain(word);
  await drawStroke(host, [0.2, 0.2], [0.8, 0.7]);
  await expect.poll(async () => (await ink(guest)).count).toBeGreaterThan(500);
  const live = await ink(host);

  await expect(host.getByTestId('reaction-button')).toHaveCount(0);
  await guest.getByTestId('reaction-button').first().click();
  await expect(host.getByTestId('reaction-float').first()).toBeVisible();
  await guest.getByTestId('like-up').click();
  await expect(guest.getByTestId('like-up')).toHaveAttribute('aria-pressed', 'true');
  await expect(host.getByTestId('like-up')).toHaveCount(0);

  await sendChat(guest, word);
  await expect(host.getByTestId('turn-end-likes')).toHaveAttribute('data-up', '1');

  // Turn 2: Noa draws nothing, Mara guesses.
  await expect(guest.getByTestId('word-choice').first()).toBeVisible({ timeout: 15_000 });
  const second = await chooseFirstWord(guest);
  await sendChat(host, second);

  // Results: podium, ranking, gallery with a crowd favourite.
  await expect(host.getByTestId('results')).toBeVisible({ timeout: 15_000 });
  await expect(host.getByTestId('podium').getByTestId('podium-place')).toHaveCount(2);
  const ranks = await host
    .getByTestId('podium-place')
    .evaluateAll((places) => places.map((place) => Number(place.getAttribute('data-rank'))).sort());
  expect(ranks[0]).toBe(1);
  await expect(host.getByTestId('ranking-row')).toHaveCount(2);
  await expect(host.getByTestId('gallery-item')).toHaveCount(2);
  const first = host.getByTestId('gallery-item').first();
  await expect(first).toContainText(word);
  await expect(first).toContainText('Mara');
  await expect(host.getByTestId('gallery-favorite')).toHaveCount(1);
  await expect(first.getByTestId('gallery-favorite')).toHaveCount(1);

  // The download is a 1600 × 1200 PNG showing the drawing.
  const [download] = await Promise.all([
    host.waitForEvent('download'),
    first.getByTestId('gallery-download').click(),
  ]);
  expect(download.suggestedFilename()).toBe(`kritzel-${word}-mara.png`);
  const png = readFileSync(await download.path());
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1600, 1200]);
  const exported = await host.evaluate(
    async (dataUrl) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let offset = 0; offset < data.length; offset += 4) {
        if (data[offset]! < 200 || data[offset + 1]! < 200 || data[offset + 2]! < 200) count += 1;
      }
      return count;
    },
    `data:image/png;base64,${png.toString('base64')}`,
  );
  expect(Math.abs(exported - live.count) / live.count).toBeLessThan(0.05);
});

test('reconnect after a network loss (AC-007-09, AC-011-13)', async ({ browser }) => {
  const host = await newParticipant(browser);
  const guest = await newParticipant(browser);
  // Keep handles to the page's sockets so the test can cut them.
  await guest.addInitScript(() => {
    const sockets: WebSocket[] = [];
    (window as unknown as { __sockets: WebSocket[] }).__sockets = sockets;
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        sockets.push(this);
      }
    };
  });
  const code = await createRoom(host, 'Mara');
  await joinRoom(guest, code, 'Noa');
  await host.getByTestId('start-game').click();
  await chooseFirstWord(host);
  await drawStroke(host, [0.2, 0.3], [0.7, 0.6]);
  await expect.poll(async () => (await ink(guest)).count).toBeGreaterThan(500);

  await guest.context().setOffline(true);
  await guest.evaluate(() =>
    (window as unknown as { __sockets: WebSocket[] }).__sockets.forEach((socket) => socket.close()),
  );
  await expect(guest.getByTestId('reconnecting')).toBeVisible();
  await expect(host.getByTestId('score-row').filter({ hasText: 'Noa' })).toBeVisible();
  await guest.waitForTimeout(5_000);
  await guest.context().setOffline(false);

  await expect(guest.getByTestId('reconnecting')).toHaveCount(0, { timeout: 15_000 });
  await expect(guest.getByTestId('game')).toBeVisible();
  await expect(host.getByTestId('score-row')).toHaveCount(2);
  await expect.poll(async () => (await ink(guest)).count).toBeGreaterThan(500);
  await drawStroke(host, [0.2, 0.7], [0.7, 0.8]);
  const hostInk = (await ink(host)).count;
  await expect.poll(async () => (await ink(guest)).count).toBe(hostInk);
});
