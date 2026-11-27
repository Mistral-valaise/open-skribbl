/** Environment configuration (spec 012). Every variable is optional. */
export interface Config {
  port: number;
  host: string;
  maxRooms: number;
  trustProxy: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: integer(env, 'PORT', 3000, 0, 65535),
    host: env.HOST || '0.0.0.0',
    maxRooms: integer(env, 'MAX_ROOMS', 500, 1, 100_000),
    trustProxy: oneOf(env, 'TRUST_PROXY', 'false', ['true', 'false']) === 'true',
    logLevel: oneOf(env, 'LOG_LEVEL', 'info', ['debug', 'info', 'warn', 'error']),
  };
}
