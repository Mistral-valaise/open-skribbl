import {
  context,
  createNoopLogger,
  createNoopMeter,
  ProxyTracerProvider,
  SeverityNumber,
  SpanKind,
  SpanStatusCode,
  trace,
  type Context,
  type Counter,
  type Histogram,
  type Logger as OtelLogger,
  type Meter,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import {
  boundedLabels,
  LOG_ATTRIBUTE_ALLOWLIST,
  METRICS,
  SPANS,
  type Labels,
  type MetricKey,
} from './contract.js';
import type { PresetIdGenerator } from './browserIds.js';
import type { Signal } from './observe.js';
import type { TraceIds } from './traceparent.js';

type KeysOfKind<K extends string> = {
  [Key in MetricKey]: (typeof METRICS)[Key]['kind'] extends K ? Key : never;
}[MetricKey];
export type CounterKey = KeysOfKind<'counter'>;
export type HistogramKey = KeysOfKind<'histogram'>;
export type ObservableKey = KeysOfKind<'gauge' | 'observableCounter'>;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SEVERITY: Record<LogLevel, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

export interface TelemetryParts {
  meter: Meter;
  tracer: Tracer;
  logger: OtelLogger;
  /** Records spans on behalf of browsers, with the ids they chose (spec 015). */
  browser?: { tracer: Tracer; ids: PresetIdGenerator };
}

export interface SpanOptions {
  kind?: SpanKind;
  labels?: Labels;
  /** Remote or explicit parent; defaults to the active context. */
  parent?: Context;
}

/**
 * The server's telemetry adapter (spec 015). Everything the application
 * records goes through this class, which enforces the contract: metric names
 * and label values come from `contract.ts`, log attributes from its allowlist.
 *
 * Without parts it records nothing; `createApp` uses that by default, so the
 * game does not know whether telemetry is on.
 */
export class Telemetry {
  readonly enabled: boolean;
  private readonly meter: Meter;
  private readonly tracer: Tracer;
  private readonly logger: OtelLogger;
  private readonly browser: TelemetryParts['browser'];
  private readonly counters = new Map<string, Counter>();
  private readonly histograms = new Map<string, Histogram>();

  constructor(parts?: TelemetryParts) {
    this.enabled = parts !== undefined;
    this.meter = parts?.meter ?? createNoopMeter();
    this.tracer = parts?.tracer ?? new ProxyTracerProvider().getTracer('kritzel');
    this.logger = parts?.logger ?? createNoopLogger();
    this.browser = parts?.browser;

    for (const definition of Object.values(METRICS)) {
      const options = { unit: definition.unit, description: definition.description };
      if (definition.kind === 'counter') {
        this.counters.set(definition.name, this.meter.createCounter(definition.name, options));
      } else if (definition.kind === 'histogram') {
        this.histograms.set(
          definition.name,
          this.meter.createHistogram(definition.name, {
            ...options,
            advice: { explicitBucketBoundaries: [...definition.buckets] },
          }),
        );
      }
    }
  }

  /** Wall-clock time in milliseconds with sub-millisecond resolution. */
  now(): number {
    return performance.timeOrigin + performance.now();
  }

  count(key: CounterKey, labels: Labels = {}, value = 1): void {
    this.counters.get(METRICS[key].name)?.add(value, boundedLabels(labels));
  }

  /** Records a duration in seconds (or a unitless score for layout shift). */
  record(key: HistogramKey, value: number, labels: Labels = {}): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.histograms.get(METRICS[key].name)?.record(value, boundedLabels(labels));
  }

  /** Registers a reader that is called on every metric export. */
  observe(key: ObservableKey, read: () => number | readonly (readonly [number, Labels])[]): void {
    const definition = METRICS[key];
    const options = { unit: definition.unit, description: definition.description };
    const instrument =
      definition.kind === 'observableCounter'
        ? this.meter.createObservableCounter(definition.name, options)
        : this.meter.createObservableGauge(definition.name, options);
    instrument.addCallback((result) => {
      const value = read();
      if (typeof value === 'number') return result.observe(value);
      for (const [point, labels] of value) result.observe(point, boundedLabels(labels));
    });
  }

  /** Runs `fn` inside a new span; the span ends when `fn` returns or its promise settles. */
  span<T>(name: string, options: SpanOptions, fn: (span: Span) => T): T {
    const parent = options.parent ?? context.active();
    const span = this.tracer.startSpan(
      name,
      { kind: options.kind ?? SpanKind.INTERNAL, attributes: boundedLabels(options.labels ?? {}) },
      parent,
    );
    const fail = (error: unknown) => {
      // Only the error class leaves the process; messages may quote player input.
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.setAttribute('error.type', error instanceof Error ? error.constructor.name : 'unknown');
    };
    try {
      const result = context.with(trace.setSpan(parent, span), () => fn(span));
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            span.end();
            return value as unknown;
          },
          (error: unknown) => {
            fail(error);
            span.end();
            throw error;
          },
        ) as T;
      }
      span.end();
      return result;
    } catch (error) {
      fail(error);
      span.end();
      throw error;
    }
  }

  /** Starts a span that the caller ends; used where a callback cannot wrap the work. */
  startSpan(name: string, options: SpanOptions = {}): Span {
    return this.tracer.startSpan(
      name,
      { kind: options.kind ?? SpanKind.INTERNAL, attributes: boundedLabels(options.labels ?? {}) },
      options.parent ?? context.active(),
    );
  }

  /** Runs `fn` with `span` as the active span. */
  within<T>(span: Span | undefined, fn: () => T): T {
    if (!span) return fn();
    return context.with(trace.setSpan(context.active(), span), fn);
  }

  /** A span for work that already happened, as a child of the active span. */
  private pastSpan(name: string, startedAt: number, labels: Labels, failed = false): void {
    const span = this.tracer.startSpan(name, {
      startTime: startedAt,
      attributes: boundedLabels(labels),
    });
    if (failed) span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  }

  /**
   * Records a span a browser measured: a root span with the ids the browser
   * put in its `traceparent`, so the server's spans of that trace are its
   * children. Timestamps are the server's; only the duration is the browser's.
   */
  browserSpan(name: string, ids: TraceIds, durationMs: number, labels: Labels): void {
    if (!this.browser) return;
    const end = this.now();
    this.browser.ids.preset(ids);
    try {
      const span = this.browser.tracer.startSpan(name, {
        root: true,
        kind: SpanKind.CLIENT,
        startTime: end - durationMs,
        attributes: boundedLabels(labels),
      });
      span.end(end);
    } finally {
      this.browser.ids.preset(undefined);
    }
  }

  /** The ids of the active span, for the stdout log line. */
  activeIds(): { trace_id: string; span_id: string } | undefined {
    const spanContext = trace.getSpan(context.active())?.spanContext();
    if (!spanContext || !trace.isSpanContextValid(spanContext)) return undefined;
    return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
  }

  /** True when the work in progress is being traced, so child spans are worth creating. */
  private get tracing(): boolean {
    return trace.getSpan(context.active())?.isRecording() ?? false;
  }

  /** Exports a log record with allowlisted attributes only (spec 015, "Privacy"). */
  log(level: LogLevel, message: string, attributes: Record<string, unknown> = {}): void {
    const exported: Record<string, string | number | boolean> = {};
    for (const key of LOG_ATTRIBUTE_ALLOWLIST) {
      const value = attributes[key];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        exported[key] = value;
      }
    }
    this.logger.emit({
      severityNumber: SEVERITY[level],
      severityText: level.toUpperCase(),
      body: message,
      attributes: exported,
    });
  }

  /**
   * Records what one room event did (spec 015, "Counted once"). `startedAt`
   * is when processing of the event began, so the spans cover the rules and
   * the fan-out.
   */
  roomSignals(signals: readonly Signal[], startedAt: number): void {
    for (const signal of signals) {
      switch (signal.kind) {
        case 'join': {
          const labels: Labels = {
            'kritzel.outcome': signal.outcome,
            'kritzel.reason': signal.reason,
            'kritzel.role': signal.role,
            'kritzel.validity': signal.validity,
          };
          this.count('joinAttempts', labels);
          if (signal.outcome === 'resumed') {
            this.count('reconnects');
            if (signal.awayMs !== undefined) this.record('reconnectDuration', signal.awayMs / 1000);
          }
          this.pastSpan(
            signal.outcome === 'resumed' ? SPANS.roomReconnect : SPANS.roomJoin,
            startedAt,
            labels,
            signal.outcome === 'rejected' && signal.validity === 'valid',
          );
          break;
        }
        case 'disconnect':
          this.count('disconnects', { 'kritzel.cause': signal.cause });
          break;
        case 'gameStarted':
          this.count('gamesStarted');
          this.pastSpan(SPANS.gameStart, startedAt, {});
          break;
        case 'gameCompleted':
          this.count('gamesCompleted');
          this.record('gameDuration', signal.durationMs / 1000, { 'kritzel.outcome': 'finished' });
          this.pastSpan(SPANS.gameEnd, startedAt, { 'kritzel.outcome': 'finished' });
          break;
        case 'gameAborted':
          this.count('gamesAborted', { 'kritzel.reason': signal.reason });
          this.record('gameDuration', signal.durationMs / 1000, { 'kritzel.outcome': 'aborted' });
          this.pastSpan(SPANS.gameEnd, startedAt, {
            'kritzel.outcome': 'aborted',
            'kritzel.reason': signal.reason,
          });
          break;
        case 'turnEnded':
          this.count('turnsEnded', { 'kritzel.reason': signal.reason });
          break;
        case 'guess':
          this.count('guesses', { 'kritzel.outcome': signal.outcome });
          this.pastSpan(SPANS.guessEvaluate, startedAt, { 'kritzel.outcome': signal.outcome });
          break;
        case 'drawRelayed':
          // Only sampled drawing operations carry a span (spec 015, "Spans").
          if (this.tracing) this.pastSpan(SPANS.drawingRelay, startedAt, {});
          break;
        case 'rejected':
          // Counted by the gateway, which knows the message type.
          break;
      }
    }
  }
}

/** Records nothing. */
export const noopTelemetry = new Telemetry();
