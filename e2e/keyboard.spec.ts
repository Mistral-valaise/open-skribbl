import { expect, test, type Page } from '@playwright/test';
import { chooseFirstWord, createRoom, joinRoom, newParticipant, sendChat } from './helpers.js';

/**
 * The phone layout while the on-screen keyboard is open (spec 011). A real
 * keyboard cannot be opened here; what it does to a page is to shrink the
 * visible height, which is what these tests do.
 */
const PHONE = { width: 360, height: 740 };
const KEYBOARD_OPEN = { width: 360, height: 330 };

/** Whether an element lies completely inside the visible area. */
async function fullyVisible(page: Page, testId: string, height: number): Promise<boolean> {
  const element = page.getByTestId(testId).first();
  if (!(await element.isVisible())) return false;
  const box = await element.boundingBox();
  return (
    box !== null &&
    box.y >= 0 &&
    box.x >= 0 &&
    box.y + box.height <= height + 0.5 &&
    box.x + box.width <= KEYBOARD_OPEN.width + 0.5
  );
}

async function expectOnScreen(page: Page, testIds: string[], height: number): Promise<void> {
  for (const testId of testIds) {
    await expect
      .poll(() => fullyVisible(page, testId, height), {
        message: `${testId} is completely visible at ${height} px height`,
        timeout: 5_000,
      })
      .toBe(true);
  }
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

/** The canvas is not covered: everything below it starts where it ends. */
async function expectCanvasUncovered(page: Page, below: string[]): Promise<void> {
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  for (const testId of below) {
    const box = (await page.getByTestId(testId).first().boundingBox())!;
    expect(box.y, `${testId} starts below the canvas`).toBeGreaterThanOrEqual(
      canvas.y + canvas.height - 0.5,
    );
  }
  // The point in the middle of the canvas belongs to the canvas, not to something on top of it.
  const onTop = await page.evaluate(
    ([x, y]) =>
      document.elementFromPoint(x!, y!)?.closest('[data-testid]')?.getAttribute('data-testid'),
    [canvas.x + canvas.width / 2, canvas.y + canvas.height - 4],
  );
  expect(onTop).toBe('canvas');
}

test('AC-011-17, AC-011-19: a guesser keeps seeing the drawing while the keyboard is open', async ({
  browser,
}) => {
  const host = await newParticipant(browser, { locale: 'en-US' });
  const guest = await newParticipant(browser, { locale: 'en-US', viewport: PHONE });
  const code = await createRoom(host, 'Mara');
  await joinRoom(guest, code, 'Noa');
  // The worst case for the one-row bar: three written words, 30 letters and
  // spaces, the longest a word may be (spec 006).
  const longest = Array.from('abcdefghij', (letter) => `enormous raspberry milkshake ${letter}`);
  await host.getByTestId('setting-customWords').fill(longest.join(', '));
  await host.getByTestId('setting-customWords').blur();
  await host.getByTestId('setting-customWordsOnly').check();
  await host.getByTestId('start-game').click();
  expect(await chooseFirstWord(host)).toHaveLength(30);
  await expect(guest.getByTestId('game')).toHaveAttribute('data-phase', 'drawing');
  await expect(guest.getByTestId('game')).toHaveAttribute('data-viewport', 'full');
  await expect(guest.getByTestId('reaction-bar')).toBeVisible();

  // The keyboard opens: 410 px of the height are gone.
  await guest.setViewportSize(KEYBOARD_OPEN);
  await expect(guest.getByTestId('game')).toHaveAttribute('data-viewport', 'typing');
  await expectOnScreen(
    guest,
    ['word-mask', 'timer', 'round-indicator', 'canvas', 'chat-input'],
    KEYBOARD_OPEN.height,
  );
  await expectCanvasUncovered(guest, ['chat-log', 'chat-input']);
  const canvas = (await guest.getByTestId('canvas').boundingBox())!;
  expect(canvas.width).toBeGreaterThanOrEqual(240);
  expect(canvas.width / canvas.height).toBeCloseTo(4 / 3, 1);
  // What is not needed for guessing waits until the keyboard closes.
  for (const hidden of ['reaction-bar', 'score-row', 'leave']) {
    await expect(guest.getByTestId(hidden).first()).toBeHidden();
  }

  // A guess can be typed and its line is the one the chat shows.
  await sendChat(guest, 'definitely not it');
  const line = guest.getByTestId('chat-log').getByText('definitely not it');
  await expect(line).toBeInViewport({ ratio: 1 });
  await expectOnScreen(guest, ['canvas', 'chat-input'], KEYBOARD_OPEN.height);

  // The keyboard closes: the full phone layout is back.
  await guest.setViewportSize(PHONE);
  await expect(guest.getByTestId('game')).toHaveAttribute('data-viewport', 'full');
  for (const shown of ['reaction-bar', 'score-row', 'leave', 'chat-log']) {
    await expect(guest.getByTestId(shown).first()).toBeVisible();
  }
  const restored = (await guest.getByTestId('canvas').boundingBox())!;
  expect(restored.width).toBeCloseTo(PHONE.width, 0);
});

test('AC-011-18: solo mode keeps the drawing visible while the keyboard is open', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto('/solo');
  await page.getByTestId('solo-start').click();
  await expect(page.getByTestId('solo')).toHaveAttribute('data-phase', 'drawing');
  await expect(page.getByTestId('solo')).toHaveAttribute('data-viewport', 'full');

  await page.setViewportSize(KEYBOARD_OPEN);
  await expect(page.getByTestId('solo')).toHaveAttribute('data-viewport', 'typing');
  await expectOnScreen(
    page,
    ['word-mask', 'timer', 'canvas', 'solo-guess-input'],
    KEYBOARD_OPEN.height,
  );
  await expectCanvasUncovered(page, ['solo-guess-input']);
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  expect(canvas.width).toBeGreaterThanOrEqual(240);

  await page.setViewportSize(PHONE);
  await expect(page.getByTestId('solo')).toHaveAttribute('data-viewport', 'full');
  await expect(page.getByTestId('solo-skip')).toBeVisible();
});
