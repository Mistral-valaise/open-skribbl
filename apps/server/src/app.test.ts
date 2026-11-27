import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type App } from './app.js';
import { startTestServer, type TestServer } from './testing/client.js';

function fakeWebDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kritzel-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Kritzel</title>');
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
  return dir;
}

describe('http (spec 012)', () => {
  let app: App;
  afterEach(() => app.server.close());

  it('AC-012-05: /healthz returns 200 and {"status":"ok"}', async () => {
    app = await createApp();
    const response = await app.server.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"status":"ok"}');
  });

  it('AC-012-06: unknown pages return the app shell, unknown API paths a JSON 404', async () => {
    app = await createApp({ webDir: fakeWebDir() });
    const page = await app.server.inject({ method: 'GET', url: '/r/ABCDEF' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<title>Kritzel</title>');
    expect(page.headers['cache-control']).toBe('no-cache');

    const api = await app.server.inject({ method: 'GET', url: '/api/unknown' });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: 'not_found' });
  });

  it('AC-012-07: every response carries the security headers and a same-origin policy', async () => {
    app = await createApp({ webDir: fakeWebDir() });
    for (const url of ['/', '/healthz', '/api/unknown', '/assets/index-abc123.js']) {
      const response = await app.server.inject({ method: 'GET', url });
      expect(response.headers['x-content-type-options'], url).toBe('nosniff');
      expect(response.headers['referrer-policy'], url).toBe('no-referrer');
      const policy = String(response.headers['content-security-policy']);
      expect(policy, url).toContain("default-src 'self'");
      expect(policy, url).not.toMatch(/https?:\/\/|\*/);
    }
  });

  it('hashed assets are cached for a year, the shell is revalidated', async () => {
    app = await createApp({ webDir: fakeWebDir() });
    const asset = await app.server.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const shell = await app.server.inject({ method: 'GET', url: '/' });
    expect(shell.headers['cache-control']).toBe('no-cache');
  });
});

describe('logging (spec 012)', () => {
  let server: TestServer;
  afterEach(() => server.close());

  it('AC-012-10: logs of a game contain no nickname, chat text or word', async () => {
    const lines: string[] = [];
    server = await startTestServer({
      log: (level, msg, context) => lines.push(JSON.stringify({ level, msg, ...context })),
    });
    const code = await server.createRoom();
    const mara = await server.connect();
    const noa = await server.connect();
    await mara.join(code, 'MaraSecretName');
    await noa.join(code, 'NoaSecretName');
    mara.send({ type: 'game.start' });
    const choices = await mara.next('word.choices');
    mara.send({ type: 'word.choose', index: 0 });
    await noa.until(() => noa.lastState?.phase === 'drawing', 'drawing');
    noa.send({ type: 'chat.send', text: 'very private chat line' });
    noa.send({ type: 'chat.send', text: choices.words[0]! });
    await noa.until(() => noa.lastState?.phase === 'turnEnd', 'turn end');
    noa.sendRaw('junk');
    await noa.until(() => noa.errors.includes('bad_request'), 'error');

    const output = lines.join('\n');
    expect(lines.length).toBeGreaterThan(2);
    expect(output).toContain(code);
    for (const secret of ['SecretName', 'very private chat line', ...choices.words]) {
      expect(output).not.toContain(secret);
    }
  });
});
