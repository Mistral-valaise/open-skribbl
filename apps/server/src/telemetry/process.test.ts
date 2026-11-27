import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resourceAttributes,
  startOtlpReceiver,
  type OtlpReceiver,
} from '../testing/otlpReceiver.js';

const serverDir = fileURLToPath(new URL('../..', import.meta.url));
const tsx = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));

interface Running {
  child: ChildProcess;
  output: () => string;
  exit: Promise<number | null>;
}

function start(env: Record<string, string>): Running {
  const child = spawn(tsx, ['src/main.ts'], {
    cwd: serverDir,
    env: { ...process.env, HOST: '127.0.0.1', ...env },
  });
  let text = '';
  child.stdout.on('data', (chunk) => (text += String(chunk)));
  child.stderr.on('data', (chunk) => (text += String(chunk)));
  const exit = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, output: () => text, exit };
}

async function waitFor(condition: () => boolean, what: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const listening = (running: Running) =>
  waitFor(() => running.output().includes('"listening"'), 'start-up');

describe('telemetry of the server process (spec 015)', () => {
  let running: Running | undefined;
  let receiver: OtlpReceiver | undefined;
  afterEach(async () => {
    running?.child.kill('SIGKILL');
    await receiver?.close();
  });

  it('AC-015-01: without TELEMETRY_ENABLED nothing is sent, even with an endpoint configured', async () => {
    receiver = await startOtlpReceiver();
    running = start({ PORT: '38481', OTEL_EXPORTER_OTLP_ENDPOINT: receiver.url });
    await listening(running);
    await fetch('http://127.0.0.1:38481/api/rooms', { method: 'POST' });
    running.child.kill('SIGTERM');
    expect(await running.exit).toBe(0);
    expect(receiver.requests).toHaveLength(0);
    expect(running.output()).toContain('"telemetry":false');
  }, 30_000);

  it('AC-015-03: OTEL_SDK_DISABLED overrides TELEMETRY_ENABLED', async () => {
    receiver = await startOtlpReceiver();
    running = start({
      PORT: '38482',
      TELEMETRY_ENABLED: 'true',
      OTEL_SDK_DISABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: receiver.url,
    });
    await listening(running);
    await fetch('http://127.0.0.1:38482/api/rooms', { method: 'POST' });
    running.child.kill('SIGTERM');
    expect(await running.exit).toBe(0);
    expect(receiver.requests).toHaveLength(0);
  }, 30_000);

  it('AC-015-04: gRPC and invalid switches stop start-up and name the variable', async () => {
    running = start({ TELEMETRY_ENABLED: 'true', OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc' });
    expect(await running.exit).not.toBe(0);
    expect(running.output()).toContain('OTEL_EXPORTER_OTLP_PROTOCOL');

    running = start({ TELEMETRY_ENABLED: 'maybe' });
    expect(await running.exit).not.toBe(0);
    expect(running.output()).toContain('TELEMETRY_ENABLED');
  }, 30_000);

  it('AC-015-05, AC-015-23: all three signals arrive with the resource, and the shutdown line is flushed', async () => {
    receiver = await startOtlpReceiver();
    running = start({
      PORT: '38483',
      TELEMETRY_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: receiver.url,
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
      OTEL_METRIC_EXPORT_INTERVAL: '1000',
      OTEL_SERVICE_NAME: 'kritzel-under-test',
      OTEL_RESOURCE_ATTRIBUTES: 'deployment.environment.name=demo',
    });
    await listening(running);
    expect(running.output()).toContain('"telemetry":true');
    const created = await fetch('http://127.0.0.1:38483/api/rooms', { method: 'POST' });
    const { code } = (await created.json()) as { code: string };
    await waitFor(() => receiver!.of('/v1/metrics').length > 0, 'a metric export');
    running.child.kill('SIGTERM');
    expect(await running.exit).toBe(0);

    for (const path of ['/v1/traces', '/v1/metrics', '/v1/logs']) {
      expect(receiver.of(path).length, path).toBeGreaterThan(0);
      const resource = resourceAttributes(receiver, path);
      expect(resource['service.name']).toBe('kritzel-under-test');
      expect(resource['service.version']).toBe('0.0.0-dev');
      expect(resource['service.instance.id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(resource['deployment.environment.name']).toBe('demo');
    }
    const logs = JSON.stringify(receiver.of('/v1/logs'));
    expect(logs).toContain('room created');
    expect(logs).toContain('shutting down');
    expect(JSON.stringify(receiver.of('/v1/traces'))).toContain('room.create');
    expect(JSON.stringify(receiver.of('/v1/metrics'))).toContain('kritzel.rooms.create.attempts');
    // The room code is on stdout (spec 012) and nowhere in the export.
    expect(running.output()).toContain(code);
    expect(receiver.text()).not.toContain(code);
  }, 30_000);

  it('AC-015-22: a collector that never answers does not delay shutdown beyond ten seconds', async () => {
    receiver = await startOtlpReceiver({ hang: true });
    running = start({
      PORT: '38484',
      TELEMETRY_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: receiver.url,
      OTEL_METRIC_EXPORT_INTERVAL: '1000',
    });
    await listening(running);
    await fetch('http://127.0.0.1:38484/api/rooms', { method: 'POST' });
    await waitFor(() => receiver!.requests.length > 0, 'an export attempt');

    const stoppedAt = Date.now();
    running.child.kill('SIGTERM');
    expect(await running.exit).toBe(0);
    expect(Date.now() - stoppedAt).toBeLessThan(10_000);
  }, 40_000);
});
