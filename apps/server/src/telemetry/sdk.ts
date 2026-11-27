import { diag, DiagLogLevel } from '@opentelemetry/api';
import { OTLPLogExporter as JsonLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPLogExporter as ProtoLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter as JsonMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPMetricExporter as ProtoMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter as JsonTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPTraceExporter as ProtoTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import {
  defaultResource,
  detectResources,
  envDetector,
  resourceFromAttributes,
  serviceInstanceIdDetector,
} from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  type IMetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  TracerProvider,
  type Sampler,
} from '@opentelemetry/sdk-trace';
import type { TelemetrySettings } from '../config.js';
import { PresetIdGenerator } from './browserIds.js';
import { enableContextPropagation } from './context.js';
import { DELIVERY } from './contract.js';
import { instrumentRuntime } from './runtime.js';
import { Telemetry } from './telemetry.js';

export interface StartedTelemetry {
  telemetry: Telemetry;
  /** Flushes what is queued, for at most `DELIVERY.shutdownFlushMs`, and stops exporting. */
  shutdown(): Promise<void>;
}

const SCOPE = 'kritzel';
/** `service.name` of spans recorded on behalf of browsers; set here, never by a browser. */
export const BROWSER_SERVICE_NAME = 'kritzel-web';

function samplerFor({ parentBased, ratio }: TelemetrySettings['sampler']): Sampler {
  const root =
    ratio >= 1
      ? new AlwaysOnSampler()
      : ratio <= 0
        ? new AlwaysOffSampler()
        : new TraceIdRatioBasedSampler(ratio);
  if (!parentBased) return root;
  // A browser may name the parent of a join, but it does not decide what is sampled.
  return new ParentBasedSampler({ root, remoteParentSampled: root, remoteParentNotSampled: root });
}

/**
 * Starts the OpenTelemetry SDK (spec 015). This module is imported
 * dynamically and only when telemetry is enabled, so a default start loads
 * none of it and opens no connection (ADR 0006).
 *
 * Endpoint, headers, timeout, compression and certificates come from the
 * standard `OTEL_EXPORTER_OTLP_*` variables, which the exporters read
 * themselves.
 */
export function startTelemetry(
  settings: TelemetrySettings,
  info: {
    version: string;
    rum: boolean;
    warn: (message: string) => void;
    /** Additional metric readers; tests use one to look at the SDK's own metrics. */
    readers?: IMetricReader[];
  },
): StartedTelemetry {
  enableContextPropagation();
  // Export failures are reported once a minute at most, on stdout only.
  let lastWarning = 0;
  const report = (message: string) => {
    const now = Date.now();
    if (now - lastWarning < 60_000) return;
    lastWarning = now;
    info.warn(message);
  };
  diag.setLogger(
    {
      error: (message) => report(String(message)),
      warn: (message) => report(String(message)),
      info: () => undefined,
      debug: () => undefined,
      verbose: () => undefined,
    },
    DiagLogLevel.WARN,
  );

  const json = settings.protocol === 'http/json';
  // `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES` win over the built-in name.
  const resource = defaultResource()
    .merge(resourceFromAttributes({ 'service.name': 'kritzel', 'service.version': info.version }))
    .merge(detectResources({ detectors: [serviceInstanceIdDetector, envDetector] }));
  const batch = {
    maxQueueSize: DELIVERY.maxQueueSize,
    maxExportBatchSize: DELIVERY.maxExportBatchSize,
    scheduledDelayMillis: DELIVERY.scheduledDelayMs,
    exportTimeoutMillis: DELIVERY.exportTimeoutMs,
  };

  const meterProvider = new MeterProvider({
    resource,
    readers: [
      ...(info.readers ?? []),
      ...(settings.metrics
        ? [
            new PeriodicExportingMetricReader({
              exporter: json ? new JsonMetricExporter() : new ProtoMetricExporter(),
              exportIntervalMillis: settings.metricIntervalMs,
              exportTimeoutMillis: Math.min(settings.metricIntervalMs, DELIVERY.exportTimeoutMs),
            }),
          ]
        : []),
    ],
  });
  const traceExporter = () => (json ? new JsonTraceExporter() : new ProtoTraceExporter());
  const sampler = samplerFor(settings.sampler);
  const tracerProvider = new TracerProvider({
    resource,
    sampler,
    spanProcessors: settings.traces
      ? [
          new BatchSpanProcessor({
            ...batch,
            exporter: traceExporter(),
            selfObsMeterProvider: meterProvider,
          }),
        ]
      : [],
  });
  const loggerProvider = new LoggerProvider({
    resource,
    processors: settings.logs
      ? [
          new BatchLogRecordProcessor({
            ...batch,
            exporter: json ? new JsonLogExporter() : new ProtoLogExporter(),
            selfObsMeterProvider: meterProvider,
          }),
        ]
      : [],
  });

  // Spans reported by browsers get their own resource and the ids the browser chose.
  const browserIds = new PresetIdGenerator();
  const browserProvider =
    info.rum && settings.traces
      ? new TracerProvider({
          resource: resource.merge(
            resourceFromAttributes({ 'service.name': BROWSER_SERVICE_NAME }),
          ),
          sampler,
          idGenerator: browserIds,
          spanProcessors: [new BatchSpanProcessor({ ...batch, exporter: traceExporter() })],
        })
      : undefined;

  const telemetry = new Telemetry({
    meter: meterProvider.getMeter(SCOPE, info.version),
    tracer: tracerProvider.getTracer(SCOPE, info.version),
    logger: loggerProvider.getLogger(SCOPE, info.version),
    browser: browserProvider && {
      tracer: browserProvider.getTracer(SCOPE, info.version),
      ids: browserIds,
    },
  });
  const stopRuntime = instrumentRuntime(telemetry);

  return {
    telemetry,
    async shutdown() {
      stopRuntime();
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        Promise.allSettled([
          tracerProvider.shutdown(),
          browserProvider?.shutdown(),
          loggerProvider.shutdown(),
          meterProvider.shutdown(),
        ]),
        new Promise((resolve) => {
          timer = setTimeout(resolve, DELIVERY.shutdownFlushMs);
        }),
      ]);
      clearTimeout(timer);
    },
  };
}
