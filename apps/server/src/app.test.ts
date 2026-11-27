import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('health endpoint', () => {
  const app = createApp();

  afterEach(() => new Promise<void>((resolve) => app.close(() => resolve())));

  it('AC-012-05: /healthz returns 200 and {"status":"ok"}', async () => {
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
    const { port } = app.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/healthz`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"status":"ok"}');
  });
});
