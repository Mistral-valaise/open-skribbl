import { isIP } from 'node:net';

/** Environment configuration (specs 012 and 015). Every variable is optional. */
export interface Config {
  port: number;
  host: string;
  maxRooms: number;
  /** `true` believes every forwarded address; a list only those sent by these proxies. */
  trustProxy: ProxyTrust;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Null when telemetry is off, which is the default (spec 015). */
  telemetry: TelemetrySettings | null;
  /** Browser measurements are offered; only ever true when telemetry is on. */
  rum: boolean;
}

/** What Fastify's `trustProxy` accepts, narrowed to what `TRUST_PROXY` can express (spec 012). */
export type ProxyTrust = boolean | string[];

export const OTLP_PROTOCOLS = ['http/protobuf', 'http/json'] as const;
const SAMPLERS = [
  'always_on',
  'always_off',
  'traceidratio',
  'parentbased_always_on',
  'parentbased_always_off',
  'parentbased_traceidratio',
] as const;

/** The subset of the standard `OTEL_*` variables the server interprets itself (spec 015). */
export interface TelemetrySettings {
  protocol: (typeof OTLP_PROTOCOLS)[number];
  traces: boolean;
  metrics: boolean;
  logs: boolean;
  metricIntervalMs: number;
  sampler: { parentBased: boolean; ratio: number };
}

export class ConfigError extends Error {}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be an integer between ${min} and ${max}, got "${raw}"`);
  }
  return value;
}

function oneOf<T extends string>(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: T,
  allowed: readonly T[],
): T {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!allowed.includes(raw as T)) {
    throw new ConfigError(`${name} must be one of ${allowed.join(', ')}, got "${raw}"`);
  }
  return raw as T;
}

/** `10.128.0.0/14`, `fd00::/8` or a single address. */
function isNetwork(value: string): boolean {
  const [address, prefix, ...rest] = value.split('/');
  const family = isIP(address ?? '');
  if (family === 0 || rest.length > 0) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128);
}

/**
 * Spec 012, "Configuration": `true`, `false`, or a comma-separated list of
 * proxy addresses and networks. With a list, forwarded addresses are believed
 * only when the connection comes from one of those proxies, and the address
 * the proxy appended counts, whatever the client wrote into the header.
 *
 * A bare hop count is not offered: it cannot tell a proxy from a client that
 * connects directly, and Fastify refuses it for that reason.
 */
function proxyTrust(env: NodeJS.ProcessEnv): ProxyTrust {
  const raw = (env.TRUST_PROXY ?? '').trim();
  if (raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  const networks = raw.split(',').map((entry) => entry.trim());
  if (networks.every(isNetwork)) return networks;
  throw new ConfigError(
    `TRUST_PROXY must be true, false, or a comma-separated list of proxy addresses and networks such as 10.128.0.0/14, got "${raw}"`,
  );
}

function ratio(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ConfigError(`${name} must be a number between 0 and 1, got "${raw}"`);
  }
  return value;
}

function loadTelemetry(env: NodeJS.ProcessEnv): TelemetrySettings | null {
  const enabled = oneOf(env, 'TELEMETRY_ENABLED', 'false', ['true', 'false']) === 'true';
  // The standard switch wins over the opt-in (spec 015, "Configuration").
  const disabled = oneOf(env, 'OTEL_SDK_DISABLED', 'false', ['true', 'false']) === 'true';
  if (!enabled || disabled) return null;

  const protocol = oneOf(env, 'OTEL_EXPORTER_OTLP_PROTOCOL', 'http/protobuf', [
    ...OTLP_PROTOCOLS,
    'grpc',
  ]);
  if (protocol === 'grpc') {
    throw new ConfigError(
      'OTEL_EXPORTER_OTLP_PROTOCOL=grpc is not supported; use http/protobuf or http/json',
    );
  }
  // One protocol for all signals: a per-signal variable may repeat it, nothing else.
  for (const signal of ['TRACES', 'METRICS', 'LOGS']) {
    const name = `OTEL_EXPORTER_OTLP_${signal}_PROTOCOL`;
    const value = env[name];
    if (value !== undefined && value !== '' && value !== protocol) {
      throw new ConfigError(
        `${name}="${value}" is not supported; all signals use OTEL_EXPORTER_OTLP_PROTOCOL (${protocol})`,
      );
    }
  }
  const exporter = (name: string) => oneOf(env, name, 'otlp', ['otlp', 'none']) === 'otlp';
  const sampler = oneOf(env, 'OTEL_TRACES_SAMPLER', 'parentbased_always_on', SAMPLERS);
  return {
    protocol,
    traces: exporter('OTEL_TRACES_EXPORTER'),
    metrics: exporter('OTEL_METRICS_EXPORTER'),
    logs: exporter('OTEL_LOGS_EXPORTER'),
    metricIntervalMs: integer(env, 'OTEL_METRIC_EXPORT_INTERVAL', 15_000, 1_000, 3_600_000),
    sampler: {
      parentBased: sampler.startsWith('parentbased_'),
      ratio: sampler.endsWith('always_off')
        ? 0
        : sampler.endsWith('traceidratio')
          ? ratio(env, 'OTEL_TRACES_SAMPLER_ARG', 1)
          : 1,
    },
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const telemetry = loadTelemetry(env);
  return {
    port: integer(env, 'PORT', 3000, 0, 65535),
    host: env.HOST || '0.0.0.0',
    maxRooms: integer(env, 'MAX_ROOMS', 500, 1, 100_000),
    trustProxy: proxyTrust(env),
    logLevel: oneOf(env, 'LOG_LEVEL', 'info', ['debug', 'info', 'warn', 'error']),
    telemetry,
    rum: oneOf(env, 'RUM_ENABLED', 'false', ['true', 'false']) === 'true' && telemetry !== null,
  };
}
