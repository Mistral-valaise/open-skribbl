import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

describe('configuration (spec 012)', () => {
  it('uses the documented defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      host: '0.0.0.0',
      maxRooms: 500,
      trustProxy: false,
      logLevel: 'info',
      telemetry: null,
      rum: false,
    });
  });

  it('AC-012-02: PORT sets the listening port', () => {
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
  });

  it('AC-012-04: an invalid value stops start-up with a message naming the variable', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ MAX_ROOMS: '0' })).toThrow(/MAX_ROOMS/);
    expect(() => loadConfig({ TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
    expect(() => loadConfig({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });
});

describe('telemetry configuration (spec 015)', () => {
  const on = { TELEMETRY_ENABLED: 'true' };

  it('is off by default and on with TELEMETRY_ENABLED, using the standard defaults', () => {
    expect(
      loadConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' }).telemetry,
    ).toBeNull();
    expect(loadConfig(on).telemetry).toEqual({
      protocol: 'http/protobuf',
      traces: true,
      metrics: true,
      logs: true,
      metricIntervalMs: 15_000,
      sampler: { parentBased: true, ratio: 1 },
    });
  });

  it('AC-015-03: OTEL_SDK_DISABLED wins over TELEMETRY_ENABLED, and RUM needs telemetry', () => {
    expect(loadConfig({ ...on, OTEL_SDK_DISABLED: 'true' }).telemetry).toBeNull();
    expect(loadConfig({ ...on, OTEL_SDK_DISABLED: 'true', RUM_ENABLED: 'true' }).rum).toBe(false);
    expect(loadConfig({ RUM_ENABLED: 'true' }).rum).toBe(false);
    expect(loadConfig({ ...on, RUM_ENABLED: 'true' }).rum).toBe(true);
  });

  it('AC-015-04: unsupported or invalid telemetry values name their variable', () => {
    expect(() => loadConfig({ ...on, OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc' })).toThrow(
      /OTEL_EXPORTER_OTLP_PROTOCOL/,
    );
    expect(() => loadConfig({ TELEMETRY_ENABLED: 'maybe' })).toThrow(/TELEMETRY_ENABLED/);
    expect(() =>
      loadConfig({ ...on, OTEL_TRACES_SAMPLER_ARG: '2', OTEL_TRACES_SAMPLER: 'traceidratio' }),
    ).toThrow(/OTEL_TRACES_SAMPLER_ARG/);
    expect(() => loadConfig({ ...on, OTEL_LOGS_EXPORTER: 'console' })).toThrow(
      /OTEL_LOGS_EXPORTER/,
    );
  });

  it('reads the per-signal exporters, the sampler and the export interval', () => {
    const settings = loadConfig({
      ...on,
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
      OTEL_TRACES_EXPORTER: 'none',
      OTEL_TRACES_SAMPLER: 'traceidratio',
      OTEL_TRACES_SAMPLER_ARG: '0.25',
      OTEL_METRIC_EXPORT_INTERVAL: '5000',
    }).telemetry!;
    expect(settings).toMatchObject({
      protocol: 'http/json',
      traces: false,
      metrics: true,
      metricIntervalMs: 5000,
      sampler: { parentBased: false, ratio: 0.25 },
    });
  });
});
