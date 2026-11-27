import { defineConfig, devices } from '@playwright/test';

const port = 3999;

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
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'pnpm --filter @kritzel/web build && pnpm --filter @kritzel/server exec tsx src/main.ts',
    env: { PORT: String(port), HOST: '127.0.0.1' },
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
