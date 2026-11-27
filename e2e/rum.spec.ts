import { expect, test, type Page } from '@playwright/test';
import { RUM, rumReportSchema, type RumEvent } from '../packages/shared/src/index.js';
import { createRoom, newParticipant } from './helpers.js';

/**
 * Browser measurements in the web app (spec 015). The server under test runs
 * without the operator switch, so the tests answer `/api/config` and
 * `/api/telemetry` themselves and look at what the page sends.
 */

/** What the server sends today (spec 012); browser measurements must leave it as it is. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/;
/** Longer than the wait between a timing event and its report. */
const QUIET_MS = 3_500;

interface Posted {
  method: string;
  contentType: string | undefined;
  body: string;
}

/** Answers like a server whose operator offers browser measurements and records the reports. */
async function offerMeasurements(page: Page): Promise<Posted[]> {
  const posted: Posted[] = [];
  await page.route('**/api/config', (route) => route.fulfill({ json: { rum: true } }));
  await page.route('**/api/telemetry', async (route) => {
    const request = route.request();
    posted.push({
      method: request.method(),
      contentType: request.headers()['content-type'],
      body: request.postData() ?? '',
    });
    await route.fulfill({ status: 204 });
  });
  return posted;
}

/** Every report is one the server would accept; returns their events in order. */
function eventsOf(posted: readonly Posted[]): RumEvent[] {
  return posted.flatMap((report) => {
    expect(report.method).toBe('POST');
    expect(report.contentType).toBe('application/json');
    expect(Buffer.byteLength(report.body)).toBeLessThanOrEqual(RUM.maxBytes);
    return rumReportSchema.parse(JSON.parse(report.body)).events;
  });
}

const timingsOf = (posted: readonly Posted[]) =>
  eventsOf(posted).filter((event) => event.type === 'timing');

/** Makes the page believe it was hidden or shown, as when the player changes tabs. */
async function setVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { value, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

const storedChoice = (page: Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), RUM.storageKey);

async function openDialog(page: Page): Promise<void> {
  await page.getByTestId('rum-toggle').click();
  await expect(page.getByTestId('rum-explanation')).toBeVisible();
}

async function closeDialog(page: Page): Promise<void> {
  await page.getByTestId('rum-close').click();
  await expect(page.getByTestId('rum-explanation')).toBeHidden();
}

async function switchMeasurements(page: Page, on: boolean): Promise<void> {
  await openDialog(page);
  const control = page.getByTestId('rum-switch');
  await expect(control).toHaveAttribute('aria-checked', String(!on));
  await control.click();
  await expect(control).toHaveAttribute('aria-checked', String(on));
  await closeDialog(page);
}

/** At phone widths: no horizontal scrolling, and the shell controls neither overlap nor leave the screen. */
async function expectShellFits(page: Page, where: string): Promise<void> {
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 740 });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        { message: `${where} at ${width}px`, timeout: 3_000 },
      )
      .toBeLessThanOrEqual(0);
    await expect(page.getByTestId('rum-toggle')).toBeInViewport({ ratio: 1 });
    const boxes = await page
      .locator(
        '[data-testid^="language-"], [data-testid="theme-toggle"], [data-testid="mute-toggle"], [data-testid="rum-toggle"], [data-testid="leave"]',
      )
      .evaluateAll((elements) =>
        elements
          .map((element) => ({
            id: element.getAttribute('data-testid'),
            box: element.getBoundingClientRect(),
          }))
          .filter(({ box }) => box.width > 0)
          .map(({ id, box }) => ({
            id,
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
          })),
      );
    for (const [index, a] of boxes.entries()) {
      expect(a.left, `${where} at ${width}px: ${a.id}`).toBeGreaterThanOrEqual(0);
      expect(a.right, `${where} at ${width}px: ${a.id}`).toBeLessThanOrEqual(width);
      for (const b of boxes.slice(index + 1)) {
        const apart =
          a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        expect(apart, `${where} at ${width}px: ${a.id} and ${b.id} overlap`).toBe(true);
      }
    }

    // The dialog with the explanation and the switch fits as well.
    await openDialog(page);
    for (const id of ['rum-explanation', 'rum-switch', 'rum-close']) {
      await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 });
    }
    await closeDialog(page);
  }
}

test('AC-015-24, AC-015-27: a server that does not offer browser measurements shows no control and gets no report', async ({
  browser,
}) => {
  const page = await newParticipant(browser);
  // Even a choice stored on an earlier visit has no effect.
  await page.addInitScript((key) => window.localStorage.setItem(key, 'on'), RUM.storageKey);
  const reports: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/telemetry') reports.push(request.url());
  });

  const config = page.waitForResponse('**/api/config');
  await page.goto('/');
  expect(await (await config).json()).toEqual({ rum: false });
  await expect(page.getByTestId('theme-toggle')).toBeVisible();
  await expect(page.getByTestId('rum-toggle')).toHaveCount(0);

  await setVisibility(page, 'hidden');
  await page.waitForTimeout(1_000);
  expect(reports).toEqual([]);
});

test('AC-015-27: nothing is sent until the player switches browser measurements on, and nothing after switching them off', async ({
  browser,
}) => {
  const page = await newParticipant(browser);
  const posted = await offerMeasurements(page);

  // Off by default: joining a room and hiding the page send nothing.
  await createRoom(page, 'Mara');
  await openDialog(page);
  await expect(page.getByTestId('rum-switch')).toHaveAttribute('aria-checked', 'false');
  // The dialog closes on Escape and gives the focus back to its control.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('rum-explanation')).toBeHidden();
  await expect(page.getByTestId('rum-toggle')).toBeFocused();
  await setVisibility(page, 'hidden');
  await page.waitForTimeout(QUIET_MS);
  expect(posted).toEqual([]);
  expect(await storedChoice(page)).toBeNull();
  await setVisibility(page, 'visible');

  // Switched on: hiding the page sends a report the server accepts.
  await switchMeasurements(page, true);
  expect(await storedChoice(page)).toBe('on');
  expect(posted).toEqual([]);
  await setVisibility(page, 'hidden');
  await expect.poll(() => posted.length).toBe(1);
  const first = eventsOf(posted);
  expect(first.length).toBeGreaterThan(0);
  expect(first.map((event) => event.type)).toContain('layout_shift');

  // The choice survives a reload, and the new page view is measured again.
  await page.reload();
  await expect(page.getByTestId('lobby')).toBeVisible();
  await openDialog(page);
  await expect(page.getByTestId('rum-switch')).toHaveAttribute('aria-checked', 'true');
  await closeDialog(page);
  await setVisibility(page, 'hidden');
  await expect.poll(() => posted.length).toBeGreaterThan(1);
  eventsOf(posted);
  await setVisibility(page, 'visible');

  // Switched off: hiding, waiting and even a new page view with a new join send nothing.
  await page.waitForTimeout(QUIET_MS);
  await switchMeasurements(page, false);
  expect(await storedChoice(page)).toBe('off');
  const before = posted.length;
  await setVisibility(page, 'hidden');
  await page.waitForTimeout(QUIET_MS);
  await page.reload();
  await expect(page.getByTestId('lobby')).toBeVisible();
  await setVisibility(page, 'hidden');
  await page.waitForTimeout(QUIET_MS);
  expect(posted.length).toBe(before);
});

test('AC-015-28, AC-015-29: with the switch on, a join carries a traceparent that its timing report repeats, and only the own origin is contacted', async ({
  browser,
  baseURL,
}) => {
  const page = await newParticipant(browser);
  const foreignRequests: string[] = [];
  const policies = new Map<string, string | undefined>();
  const joins: { traceparent?: string }[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(baseURL!) && !/^(data|blob):/.test(url)) foreignRequests.push(url);
  });
  page.on('response', (response) => {
    // The two answers the test gives itself do not come from the server.
    if (/\/api\/(config|telemetry)$/.test(new URL(response.url()).pathname)) return;
    policies.set(response.url(), response.headers()['content-security-policy']);
  });
  page.on('websocket', (socket) => {
    if (!socket.url().startsWith(baseURL!.replace('http', 'ws')))
      foreignRequests.push(socket.url());
    socket.on('framesent', (frame) => {
      const message = JSON.parse(String(frame.payload)) as { type: string; traceparent?: string };
      if (message.type === 'join') joins.push(message);
    });
  });
  await page.addInitScript(() => {
    // Keep handles to the page's sockets so the test can cut them, and note policy violations.
    const state = window as unknown as { __sockets: WebSocket[]; __violations: string[] };
    state.__sockets = [];
    state.__violations = [];
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        state.__sockets.push(this);
      }
    };
    document.addEventListener('securitypolicyviolation', (event) =>
      state.__violations.push(event.blockedURI),
    );
  });
  const posted = await offerMeasurements(page);

  await page.goto('/');
  await switchMeasurements(page, true);
  await page.getByTestId('nickname-input').fill('Mara');
  await page.getByTestId('create-room').click();
  await expect(page.getByTestId('lobby')).toBeVisible();

  // The join names a trace, and the report of how long it took names the same one.
  expect(joins).toHaveLength(1);
  expect(joins[0]!.traceparent).toMatch(TRACEPARENT);
  await expect.poll(() => timingsOf(posted).length).toBe(1);
  const joined = timingsOf(posted)[0]!;
  expect(joined).toMatchObject({ name: 'join', outcome: 'ok', traceparent: joins[0]!.traceparent });
  expect(joined.durationMs).toBeLessThan(30_000);

  // A lost connection: the next attempt is a reconnect with ids of its own.
  await page.evaluate(() =>
    (window as unknown as { __sockets: WebSocket[] }).__sockets.forEach((socket) => socket.close()),
  );
  await expect.poll(() => joins.length).toBe(2);
  expect(joins[1]!.traceparent).toMatch(TRACEPARENT);
  expect(joins[1]!.traceparent).not.toBe(joins[0]!.traceparent);
  await expect.poll(() => timingsOf(posted).length).toBe(2);
  expect(timingsOf(posted)[1]).toMatchObject({
    name: 'reconnect',
    outcome: 'ok',
    traceparent: joins[1]!.traceparent,
  });

  // The vitals go out when the page is hidden: to the same place, like everything else.
  await setVisibility(page, 'hidden');
  await expect.poll(() => eventsOf(posted).some((event) => event.type !== 'timing')).toBe(true);

  expect(foreignRequests).toEqual([]);
  expect(
    await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations),
  ).toEqual([]);
  expect(policies.size).toBeGreaterThan(3);
  for (const [url, policy] of policies) expect(policy, url).toBe(CONTENT_SECURITY_POLICY);
});

test('AC-011-06: the control for browser measurements fits the home screen, the lobby header and the top bar at phone widths', async ({
  browser,
}) => {
  const page = await newParticipant(browser, {
    viewport: { width: 375, height: 740 },
    hasTouch: true,
    isMobile: true,
  });
  await offerMeasurements(page);
  await page.goto('/');
  // A phone's touch targets are larger, which is the tighter case.
  expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);
  await expectShellFits(page, 'home');

  // The top bar of a solo run is the game's top bar.
  await page.goto('/solo');
  await page.getByTestId('solo-start').click();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expectShellFits(page, 'top bar');

  await createRoom(page, 'Mara');
  await expectShellFits(page, 'lobby');
});
