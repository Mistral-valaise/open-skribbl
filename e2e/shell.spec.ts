import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  chooseFirstWord,
  createRoom,
  joinRoom,
  newParticipant,
  sendChat,
  setSetting,
} from './helpers.js';

const theme = (page: Page) => page.locator('html').getAttribute('data-theme');
const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('theme follows the system, toggles and is remembered (AC-011-01, AC-011-02, AC-011-03)', async ({
  browser,
}) => {
  const dark = await newParticipant(browser, { colorScheme: 'dark' });
  await dark.goto('/');
  expect(await theme(dark)).toBe('dark');
  const darkBackground = await background(dark);

  const light = await newParticipant(browser, { colorScheme: 'light' });
  await light.goto('/');
  expect(await theme(light)).toBe('light');
  expect(await background(light)).not.toBe(darkBackground);

  // The toggle switches at once and the choice wins over the system on reload.
  await dark.getByTestId('theme-toggle').click();
  expect(await theme(dark)).toBe('light');
  expect(await background(dark)).toBe(await background(light));
  await dark.reload({ waitUntil: 'domcontentloaded' });
  expect(await theme(dark)).toBe('light');
  await dark.getByTestId('theme-toggle').click();
  expect(await theme(dark)).toBe('dark');

  // The canvas is white in both themes.
  for (const page of [dark, light]) {
    await page.goto('/solo');
    await page.getByTestId('solo-start').click();
    const corner = await page.getByTestId('canvas').evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      return [...canvas.getContext('2d')!.getImageData(2, 2, 1, 1).data];
    });
    expect(corner).toEqual([255, 255, 255, 255]);
  }
});

const WIDTHS = [320, 375, 768, 1024, 1440];

async function expectNoHorizontalScroll(page: Page, where: string): Promise<void> {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    // Polled: the layout settles a frame or two after the viewport changes.
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        { message: `${where} at ${width}px`, timeout: 3_000 },
      )
      .toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

/** Waits until entrance animations are over, so colours are final when scanned. */
async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.race([
      Promise.allSettled(finite.map((animation) => animation.finished)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  });
}

async function expectAccessible(page: Page, where: string): Promise<void> {
  for (const mode of ['first', 'second']) {
    await settled(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id}: ${violation.nodes[0]?.target.join(' ')}`);
    expect(serious, `${where}, ${await theme(page)} theme`).toEqual([]);
    if (mode === 'first') await page.getByTestId('theme-toggle').first().click();
  }
  await page.getByTestId('theme-toggle').first().click();
}

test('layout, accessibility scan, reduced motion and translated errors (AC-011-06, AC-011-07, AC-011-08, AC-011-10, AC-011-12, AC-011-14)', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const host = await newParticipant(browser, { locale: 'en-US' });
  const guest = await newParticipant(browser, { locale: 'en-US' });
  const watcher = await newParticipant(browser, { locale: 'de-DE' });

  await host.goto('/');
  await expectNoHorizontalScroll(host, 'home');
  await expectAccessible(host, 'home');

  const code = await createRoom(host, 'Mara');
  await joinRoom(guest, code, 'Noa');
  await watcher.goto(`/r/${code}`);
  await watcher.getByTestId('nickname-input').fill('Lupe');
  await watcher.getByTestId('join-spectator').check();
  await watcher.getByTestId('join-room').click();
  await expect(watcher.getByTestId('lobby')).toBeVisible();
  await setSetting(host, 'rounds', '1');
  await expectNoHorizontalScroll(host, 'lobby');
  await expectAccessible(host, 'lobby');

  await host.getByTestId('start-game').click();
  const word = await chooseFirstWord(host);
  await expectNoHorizontalScroll(host, 'game as drawer');
  await expectNoHorizontalScroll(guest, 'game as guesser');
  await expectAccessible(guest, 'game');

  // Phone width: the guesser sees mask, timer, canvas and input without scrolling …
  await guest.setViewportSize({ width: 375, height: 740 });
  expect(await guest.evaluate(() => window.scrollY)).toBe(0);
  for (const id of ['word-mask', 'timer', 'canvas', 'chat-input']) {
    const box = (await guest.getByTestId(id).boundingBox())!;
    expect(box.y, id).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, id).toBeLessThanOrEqual(740);
    expect(box.x + box.width, id).toBeLessThanOrEqual(375);
  }
  // … and the drawer can reach every tool, size and colour.
  await host.setViewportSize({ width: 375, height: 740 });
  const controls = host.locator(
    '[data-testid^="tool-"], [data-testid^="size-"], [data-testid^="color-"], [data-testid="undo"], [data-testid="redo"], [data-testid="clear"]',
  );
  const count = await controls.count();
  expect(count).toBeGreaterThanOrEqual(3 + 5 + 24 + 3);
  for (let index = 0; index < count; index += 1) {
    await controls.nth(index).scrollIntoViewIfNeeded();
    await expect(controls.nth(index)).toBeInViewport();
  }
  await host.setViewportSize({ width: 1280, height: 800 });
  await guest.setViewportSize({ width: 1280, height: 800 });

  // A server error reaches the spectator as a translated toast, not as a code.
  await sendChat(watcher, word);
  const toast = watcher.getByTestId('toast');
  await expect(toast).toBeVisible();
  const text = await toast.innerText();
  expect(text.trim().length).toBeGreaterThan(5);
  expect(text).not.toContain('message_blocked');
  expect(text).not.toContain('_');

  // Finish the game; one participant asked for reduced motion.
  await guest.emulateMedia({ reducedMotion: 'reduce' });
  await sendChat(guest, word);
  await expect(guest.getByTestId('word-choice').first()).toBeVisible({ timeout: 15_000 });
  const second = await chooseFirstWord(guest);
  await sendChat(host, second);
  await expect(host.getByTestId('results')).toBeVisible({ timeout: 15_000 });
  await expect(host.getByTestId('confetti')).toBeVisible();
  await expect(guest.getByTestId('results')).toBeVisible();
  await expect(guest.getByTestId('confetti')).toHaveCount(0);
  await expectNoHorizontalScroll(host, 'results');
  await expectAccessible(host, 'results');
});

/** Presses Tab until the focused element has the given test id. */
async function tabTo(page: Page, testId: string): Promise<void> {
  for (let presses = 0; presses < 80; presses += 1) {
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    if (focused === testId) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached "${testId}"`);
}

test('AC-011-09: a game can be hosted, joined and guessed with the keyboard alone', async ({
  browser,
}) => {
  const host = await newParticipant(browser);
  const guest = await newParticipant(browser);

  await host.goto('/');
  await tabTo(host, 'nickname-input');
  await host.keyboard.type('Mara');
  await tabTo(host, 'create-room');
  await host.keyboard.press('Enter');
  await expect(host.getByTestId('lobby')).toBeVisible();
  const code = (await host.getByTestId('room-code').innerText()).replace(/\s/g, '');

  await guest.goto(`/r/${code}`);
  await tabTo(guest, 'nickname-input');
  await guest.keyboard.type('Noa');
  await tabTo(guest, 'join-room');
  await guest.keyboard.press('Enter');
  await expect(guest.getByTestId('lobby')).toBeVisible();

  await tabTo(host, 'setting-rounds');
  await host.keyboard.press('ArrowUp');
  await host.keyboard.press('ArrowUp');
  await expect(host.getByTestId('setting-rounds')).toHaveValue('1');
  await tabTo(host, 'start-game');
  await host.keyboard.press('Enter');

  for (const [drawer, guesser] of [
    [host, guest],
    [guest, host],
  ] as const) {
    await expect(drawer.getByTestId('word-choice').first()).toBeVisible({ timeout: 15_000 });
    await tabTo(drawer, 'word-choice');
    await drawer.keyboard.press('Enter');
    await expect(drawer.getByTestId('word-display')).toBeVisible();
    const word = (await drawer.getByTestId('word-display').innerText()).trim();
    await tabTo(guesser, 'chat-input');
    await guesser.keyboard.type(word);
    await guesser.keyboard.press('Enter');
    await expect(guesser.getByTestId('turn-end')).toBeVisible();
  }

  await expect(host.getByTestId('results')).toBeVisible({ timeout: 15_000 });
  await tabTo(host, 'play-again');
  await host.keyboard.press('Enter');
  await expect(guest.getByTestId('lobby')).toBeVisible();
});

test('AC-011-16: title, favicon and web app manifest', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Kritzel');

  const icon = await page.locator('link[rel~="icon"]').first().getAttribute('href');
  expect((await request.get(icon!)).status()).toBe(200);

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifestResponse = await request.get(manifestHref!);
  expect(manifestResponse.status()).toBe(200);
  const manifest = (await manifestResponse.json()) as {
    name: string;
    icons: { src: string; sizes: string }[];
  };
  expect(manifest.name).toBe('Kritzel');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  for (const entry of manifest.icons) {
    expect((await request.get(new URL(entry.src, page.url()).toString())).status()).toBe(200);
  }
});
