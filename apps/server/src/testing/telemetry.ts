import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { enableContextPropagation } from '../telemetry/context.js';
import { Telemetry } from '../telemetry/telemetry.js';

/** One exported data point, flattened for assertions. */
export interface MetricPoint {
  name: string;
  unit: string;
  labels: Record<string, unknown>;
  /** Sum for counters and gauges; number of observations for histograms. */
  value: number;
  /** Histograms only. */
  sum?: number;
  boundaries?: number[];
}

export interface TestTelemetry {
  telemetry: Telemetry;
  /** Finished spans, oldest first. */
  spans(): ReturnType<InMemorySpanExporter['getFinishedSpans']>;
  logs(): ReturnType<InMemoryLogRecordExporter['getFinishedLogRecords']>;
  /** Collects and returns the current value of every metric. */
  metrics(): Promise<MetricPoint[]>;
  shutdown(): Promise<void>;
}

/** A telemetry adapter backed by in-memory exporters: no network, no global providers. */
export function createTestTelemetry(): TestTelemetry {
  enableContextPropagation();
  const spanExporter = new InMemorySpanExporter();
  const tracerProvider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: spanExporter })],
  });
  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const meterProvider = new MeterProvider({
    readers: [
      // Never fires on its own; tests collect with `metrics()`.
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 3_600_000,
      }),
    ],
  });
  const logExporter = new InMemoryLogRecordExporter();
  const loggerProvider = new LoggerProvider({
    processors: [new SimpleLogRecordProcessor({ exporter: logExporter })],
  });

  return {
    telemetry: new Telemetry({
      meter: meterProvider.getMeter('kritzel'),
      tracer: tracerProvider.getTracer('kritzel'),
      logger: loggerProvider.getLogger('kritzel'),
    }),
    spans: () => spanExporter.getFinishedSpans(),
    logs: () => logExporter.getFinishedLogRecords(),
    async metrics() {
      metricExporter.reset();
      await meterProvider.forceFlush();
      const points: MetricPoint[] = [];
      for (const resourceMetrics of metricExporter.getMetrics()) {
        for (const scope of resourceMetrics.scopeMetrics) {
          for (const metric of scope.metrics) {
            for (const point of metric.dataPoints) {
              const base = {
                name: metric.descriptor.name,
                unit: metric.descriptor.unit,
                labels: { ...point.attributes },
              };
              if (typeof point.value === 'number') {
                points.push({ ...base, value: point.value });
              } else {
                const histogram = point.value as {
                  count: number;
                  sum?: number;
                  buckets: { boundaries: number[] };
                };
                points.push({
                  ...base,
                  value: histogram.count,
                  sum: histogram.sum,
                  boundaries: histogram.buckets.boundaries,
                });
              }
            }
          }
        }
      }
      return points;
    },
    async shutdown() {
      await Promise.all([
        tracerProvider.shutdown(),
        meterProvider.shutdown(),
        loggerProvider.shutdown(),
      ]);
    },
  };
}

/** Adds up the points of `name` whose labels include `labels`. */
export function total(
  points: readonly MetricPoint[],
  name: string,
  labels: Record<string, unknown> = {},
): number {
  return points
    .filter(
      (point) =>
        point.name === name &&
        Object.entries(labels).every(([key, value]) => point.labels[key] === value),
    )
    .reduce((sum, point) => sum + point.value, 0);
}
