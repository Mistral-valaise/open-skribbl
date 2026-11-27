import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type App } from './app.js';

describe('http', () => {
  let app: App;

  afterEach(() => app.server.close());

  it('AC-012-05: /healthz returns 200 and {"status":"ok"}', async () => {
    app = await createApp();

    const response = await app.server.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"status":"ok"}');
  });
});
