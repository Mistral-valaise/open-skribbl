import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { startTestServer, type TestServer } from '../testing/client.js';
import { createTestTelemetry, type TestTelemetry } from '../testing/telemetry.js';
import { DELIVERY } from './contract.js';
import { instrumentRuntime } from './runtime.js';
import { startTelemetry, type StartedTelemetry } from './sdk.js';

let server: TestServer | undefined;
let probe: TestTelemetry | undefined;
let started: StartedTelemetry | undefined;
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
afterEach(async () => {
  await server?.close();
  await probe?.shutdown();
  await started?.shutdown();
  server = probe = started = undefined;
  if (endpoint === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = endpoint;
});

describe('runtime metrics (spec 015)', () => {
  it('AC-015-15: memory, heap, CPU, garbage collection and event-loop delay are exported', async () => {
    probe = createTestTelemetry();
    const stop = instrumentRuntime(probe.telemetry);
    try {
      // Allocate until the collector has run and its observer has reported.
      let seen = false;
      for (let round = 0; round < 400 && !seen; round += 1) {
        void Array.from({ length: 20_000 }, (_, index) => ({ index }));
        await new Promise((resolve) => setTimeout(resolve, 5));
        seen = (await probe.metrics()).some((point) => point.name === 'v8js.gc.duration');
      }
      const points = await probe.metrics();
      const value = (name: string) => points.find((point) => point.name === name)?.value;
      expect(value('process.memory.usage')).toBeGreaterThan(1_000_000);
      expect(value('v8js.memory.heap.used')).toBeGreaterThan(1_000_000);
      expect(value('v8js.memory.heap.limit')).toBeGreaterThan(value('v8js.memory.heap.used')!);
      expect(value('v8js.gc.duration')).toBeGreaterThan(0);
      expect(value('nodejs.eventloop.delay.p99')).toBeGreaterThanOrEqual(0);
      expect(value('nodejs.eventloop.delay.max')).toBeGreaterThanOrEqual(0);
      expect(value('nodejs.eventloop.utilization')).toBeGreaterThanOrEqual(0);
      const cpu = points.filter((point) => point.name === 'process.cpu.time');
      expect(cpu.map((point) => point.labels['cpu.mode']).sort()).toEqual(['system', 'user']);
      expect(cpu.every((point) => point.value > 0)).toBe(true);
    } finally {
      stop();
    }
  }, 20_000);
});

describe('delivery limits (spec 015)', () => {
  it('AC-015-21: with an unreachable collector a game completes and the span queue stays bounded', async () => {
    // Nothing listens on the discard port.
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:9';
    const own = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({
      exporter: own,
      exportIntervalMillis: 3_600_000,
    });
    const warnings: string[] = [];
    started = startTelemetry(loadConfig({ TELEMETRY_ENABLED: 'true' }).telemetry!, {
      version: 'test',
      rum: false,
      warn: (message) => warnings.push(message),
      readers: [reader],
    });
    server = await startTestServer({ telemetry: started.telemetry });

    const code = await server.createRoom();
    const mara = await server.connect();
    const noa = await server.connect();
    await mara.join(code, 'Mara');
    await noa.join(code, 'Noa');
    mara.send({ type: 'settings.update', settings: { rounds: 1 } });
    mara.send({ type: 'game.start' });
    for (const [drawer, guesser] of [
      [mara, noa],
      [noa, mara],
    ] as const) {
      const offered = (await drawer.next('word.choices')).words[0]!;
      drawer.send({ type: 'word.choose', index: 0 });
      await guesser.until(() => guesser.lastState?.phase === 'drawing', 'drawing');
      guesser.send({ type: 'chat.send', text: offered });
      await guesser.until(() => guesser.lastState?.phase === 'turnEnd', 'turn end');
      server.clock.advance(6_000);
    }
    await mara.until(() => mara.lastState?.phase === 'gameEnd', 'results');

    for (let count = 0; count < 3 * DELIVERY.maxQueueSize; count += 1) {
      started.telemetry.span('room.create', {}, () => undefined);
    }
    await reader.forceFlush();
    const selfMetrics = own
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics)
      .flatMap((scope) => scope.metrics);
    const pointsOf = (name: string) =>
      selfMetrics
        .filter((metric) => metric.descriptor.name === name)
        .flatMap((metric) =>
          (metric.dataPoints as { value: unknown; attributes: Record<string, unknown> }[]).map(
            (point) => ({ value: point.value as number, attributes: point.attributes }),
          ),
        );
    const capacity = pointsOf('otel.sdk.processor.span.queue.capacity');
    const size = pointsOf('otel.sdk.processor.span.queue.size');
    expect(capacity.map((point) => point.value)).toEqual([DELIVERY.maxQueueSize]);
    expect(size).toHaveLength(1);
    expect(size[0]!.value).toBeLessThanOrEqual(DELIVERY.maxQueueSize);
    expect(size[0]!.value).toBeGreaterThan(0);
    const dropped = pointsOf('otel.sdk.processor.span.processed').filter(
      (point) => point.attributes['error.type'] === 'queue_full',
    );
    expect(dropped.reduce((sum, point) => sum + point.value, 0)).toBeGreaterThan(
      DELIVERY.maxQueueSize,
    );

    const stoppingAt = Date.now();
    await started.shutdown();
    expect(Date.now() - stoppingAt).toBeLessThan(DELIVERY.shutdownFlushMs + 1_000);
  }, 30_000);
});
