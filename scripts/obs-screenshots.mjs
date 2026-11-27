#!/usr/bin/env node
// Takes screenshots of the provisioned Grafana dashboards, as evidence that
// they render real data (spec 015).
//
// Usage: node scripts/obs-screenshots.mjs <output directory> [trace id or TraceQL]
//
// Reads the admin password from .env.observability (or GRAFANA_PASSWORD) and
// the address from GRAFANA (default http://127.0.0.1:3001). The password is
// sent as a header and never typed or printed.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const pw =
  process.env.GRAFANA_PASSWORD ??
  readFileSync('.env.observability', 'utf8')
    .match(/GRAFANA_ADMIN_PASSWORD=(.*)/)[1]
    .trim();
const base = process.env.GRAFANA ?? 'http://127.0.0.1:3001';
const out = process.argv[2];
const trace = process.argv[3];
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1100 },
  extraHTTPHeaders: { authorization: `Basic ${Buffer.from(`admin:${pw}`).toString('base64')}` },
});
const page = await context.newPage();
const shots = [
  ['overview', '/d/kritzel-overview?kiosk&from=now-30m&to=now', 1900],
  ['websocket', '/d/kritzel-websocket?kiosk&from=now-30m&to=now', 1700],
  ['game', '/d/kritzel-game?kiosk&from=now-30m&to=now', 1500],
  ['runtime', '/d/kritzel-runtime?kiosk&from=now-30m&to=now', 2400],
  ['security', '/d/kritzel-security?kiosk&from=now-30m&to=now', 1500],
  ['slo-high-level', '/d/high-level-sloth-slos?kiosk&from=now-30m&to=now', 1100],
  [
    'slo-detail',
    '/d/slo-detail?kiosk&var-service=kritzel&var-slo=api-availability&from=now-30m&to=now',
    1700,
  ],
];
for (const [name, path, height] of shots) {
  await page.setViewportSize({ width: 1600, height });
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name, await page.title());
}
if (trace) {
  const panes = encodeURIComponent(
    JSON.stringify({
      a: {
        datasource: 'tempo',
        queries: [
          {
            refId: 'A',
            datasource: { type: 'tempo', uid: 'tempo' },
            queryType: 'traceql',
            query: trace,
          },
        ],
        range: { from: 'now-1h', to: 'now' },
      },
    }),
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${base}/explore?schemaVersion=1&panes=${panes}&orgId=1&kiosk`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/trace.png` });
  console.log('shot trace');
}
await browser.close();
