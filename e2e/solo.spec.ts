import { expect, test, type Page } from '@playwright/test';

interface Category {
  id: string;
  file: string;
  en: string | null;
  de: string | null;
  es: string | null;
  fr: string | null;
}

/** Serves only ten categories, so the test knows every possible answer. */
async function limitCategories(page: Page): Promise<Category[]> {
  const response = await page.request.get('/content/solo/categories.json');
  const ten = ((await response.json()) as Category[]).slice(0, 10);
  await page.route('**/content/solo/categories.json', (route) => route.fulfill({ json: ten }));
  return ten;
}

async function guess(page: Page, text: string): Promise<void> {
  await page.getByTestId('solo-guess-input').fill(text);
  await page.getByTestId('solo-guess-input').press('Enter');
}

const progress = (page: Page) => page.getByTestId('solo-progress');

test('a solo run from the home screen to the summary (AC-009-01, AC-009-02, AC-009-10, AC-009-11, AC-009-12, AC-009-14, AC-009-16)', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const categories = await limitCategories(page);
  const sockets: string[] = [];
  const requests: string[] = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));

  // No nickname and no room are needed.
  await page.goto('/');
  await page.getByTestId('play-solo').click();
  await expect(page).toHaveURL(/\/solo$/);
  await expect(page.getByTestId('solo')).toBeVisible();
  await page.getByTestId('solo-language').selectOption('en');
  await expect(page.getByTestId('solo-credit')).toHaveAttribute('href', /NOTICE\.md/);

  page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`));
  await page.getByTestId('solo-start').click();
  await expect(progress(page)).toHaveAttribute('data-index', '1');
  await expect(progress(page)).toHaveAttribute('data-total', '10');
  await expect(page.getByTestId('word-mask')).toBeVisible();
  await expect(page.getByTestId('timer')).toBeVisible();

  // Drawing 1: a wrong guess is listed; one of the ten labels is right.
  await guess(page, 'zzzzzz');
  await expect(page.getByTestId('solo-guess').filter({ hasText: 'zzzzzz' })).toHaveAttribute(
    'data-close',
    'false',
  );
  for (const category of categories) {
    if (await page.getByTestId('solo-reveal').isVisible()) break;
    await guess(page, category.en!);
  }
  await expect(page.getByTestId('solo-reveal')).toBeVisible();
  const revealedAt = Date.now();
  const solved = (await page.getByTestId('solo-reveal').innerText()).toLowerCase();
  expect(categories.some((category) => solved.includes(category.en!.toLowerCase()))).toBe(true);

  // The word stays revealed for about 2.5 s before the next drawing starts.
  await expect(progress(page)).toHaveAttribute('data-index', '2', { timeout: 6_000 });
  const revealMs = Date.now() - revealedAt;
  expect(revealMs).toBeGreaterThan(1_800);
  expect(revealMs).toBeLessThan(4_000);

  // The other nine are skipped.
  for (let index = 2; index <= 10; index += 1) {
    await expect(progress(page)).toHaveAttribute('data-index', String(index), { timeout: 6_000 });
    await page.getByTestId('solo-skip').click();
    await expect(page.getByTestId('solo-reveal')).toBeVisible();
  }

  // Summary: ten distinct words, points per drawing, total, personal best.
  await expect(page.getByTestId('solo-summary')).toBeVisible({ timeout: 6_000 });
  const rows = page.getByTestId('solo-summary-row');
  await expect(rows).toHaveCount(10);
  const points = await rows.evaluateAll((elements) =>
    elements.map((element) => Number(element.getAttribute('data-points'))),
  );
  expect(points[0]).toBeGreaterThan(100);
  expect(points.slice(1)).toEqual(Array(9).fill(0));
  const words = await rows.evaluateAll((elements) =>
    elements.map((element) => element.textContent),
  );
  expect(new Set(words).size).toBe(10);
  const total = String(points[0]);
  await expect(page.getByTestId('solo-total')).toContainText(total);
  await expect(page.getByTestId('solo-best')).toContainText(total);

  // During the run: nothing but GETs for solo content, and no WebSocket.
  const duringRun = [...requests];
  expect(sockets).toEqual([]);
  expect(duringRun.filter((entry) => !entry.startsWith(`GET ${baseURL}/content/solo/`))).toEqual(
    [],
  );
  expect(duringRun.some((entry) => entry.includes('/content/solo/drawings/'))).toBe(true);

  // The best survives a reload, in the browser only.
  await page.reload();
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).toContain(total);
});

test('AC-009-13: a started run can be finished without a network', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/solo');
  await page.getByTestId('solo-start').click();
  await expect(progress(page)).toHaveAttribute('data-index', '1');
  await context.setOffline(true);

  for (let index = 1; index <= 10; index += 1) {
    await expect(progress(page)).toHaveAttribute('data-index', String(index), { timeout: 6_000 });
    // The replay is drawing: the canvas is not blank after a moment.
    if (index === 1) {
      await expect
        .poll(() =>
          page.getByTestId('canvas').evaluate((element) => {
            const canvas = element as HTMLCanvasElement;
            const { data } = canvas
              .getContext('2d')!
              .getImageData(0, 0, canvas.width, canvas.height);
            for (let offset = 0; offset < data.length; offset += 4)
              if (data[offset]! < 128) return true;
            return false;
          }),
        )
        .toBe(true);
    }
    await page.getByTestId('solo-skip').click();
  }
  await expect(page.getByTestId('solo-summary')).toBeVisible({ timeout: 6_000 });
  await expect(page.getByTestId('solo-summary-row')).toHaveCount(10);
});
