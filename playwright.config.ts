import { defineConfig, devices } from '@playwright/test';

const port = 3999;
// Set KRITZEL_E2E_URL to test an instance that is already running, for
// example the container behind a TLS reverse proxy. Its certificate may be
// self-signed.
const external = process.env.KRITZEL_E2E_URL;

/**
 * End-to-end tests run against the built web app served by the real server.
 * Room creation is limited to 10 per minute per address (architecture §4),
 * so the suite creates fewer rooms than that.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: external ?? `http://127.0.0.1:${port}`,
    ignoreHTTPSErrors: external !== undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: external
    ? undefined
    : {
        command:
          'pnpm --filter @kritzel/web build && pnpm --filter @kritzel/server exec tsx src/main.ts',
        env: { PORT: String(port), HOST: '127.0.0.1' },
        url: `http://127.0.0.1:${port}/healthz`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
