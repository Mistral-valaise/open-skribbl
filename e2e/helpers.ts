import { expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';

/** A page in its own browser context: one participant. */
export async function newParticipant(browser: Browser, options: BrowserContextOptions = {}) {
  const context = await browser.newContext(options);
  return context.newPage();
}

/** Creates a room from the home screen and returns its code. */
export async function createRoom(page: Page, nickname: string): Promise<string> {
  await page.goto('/');
  await page.getByTestId('nickname-input').fill(nickname);
  await page.getByTestId('create-room').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  return (await page.getByTestId('room-code').innerText()).replace(/\s/g, '');
}

/** Opens the invite link and joins through the join form. */
export async function joinRoom(page: Page, code: string, nickname: string): Promise<void> {
  await page.goto(`/r/${code}`);
  await page.getByTestId('nickname-input').fill(nickname);
  await page.getByTestId('join-room').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
}

/** Sets a lobby setting whether it is rendered as a select or an input. */
export async function setSetting(page: Page, name: string, value: string): Promise<void> {
  const control = page.getByTestId(`setting-${name}`);
  const tag = await control.evaluate((element) => element.tagName);
  if (tag === 'SELECT') {
    await control.selectOption(value);
  } else {
    await control.fill(value);
    await control.blur();
  }
}

/** The drawer picks the first offered word and returns it. */
export async function chooseFirstWord(drawer: Page): Promise<string> {
  await drawer.getByTestId('word-choice').first().click();
  await expect(drawer.getByTestId('word-display')).toBeVisible();
  return (await drawer.getByTestId('word-display').innerText()).trim();
}

export async function sendChat(page: Page, text: string): Promise<void> {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-input').press('Enter');
}

export interface Ink {
  count: number;
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
}

/** Counts non-white pixels of the canvas backing store and their bounding box. */
export function ink(page: Page): Promise<Ink> {
  return page.getByTestId('canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    let minX = canvas.width;
    let maxX = -1;
    let minY = canvas.height;
    let maxY = -1;
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset]! > 200 && data[offset + 1]! > 200 && data[offset + 2]! > 200) continue;
      const pixel = offset / 4;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      count += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return {
      count,
      width: count === 0 ? 0 : maxX - minX + 1,
      height: count === 0 ? 0 : maxY - minY + 1,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    };
  });
}

/** Viewport position of a point given as fractions of the canvas. */
export async function canvasPoint(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** Draws a straight stroke with the mouse between two fractional canvas positions. */
export async function drawStroke(page: Page, from: [number, number], to: [number, number]) {
  const start = await canvasPoint(page, ...from);
  const end = await canvasPoint(page, ...to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 5 });
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
}
