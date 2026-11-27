import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config.js';
import { createLogger } from './log.js';
import type { StartedTelemetry } from './telemetry/sdk.js';
import { noopTelemetry } from './telemetry/telemetry.js';

/** Replaced by the build; the development server has no version. */
declare const __KRITZEL_VERSION__: string | undefined;
const version = typeof __KRITZEL_VERSION__ === 'string' ? __KRITZEL_VERSION__ : '0.0.0-dev';

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  createLogger('error')('error', error.message);
  process.exit(1);
}

// The SDK is loaded only when telemetry is on (spec 015, ADR 0006).
let started: StartedTelemetry | undefined;
if (config.telemetry) {
  const { startTelemetry } = await import('./telemetry/sdk.js');
  started = startTelemetry(config.telemetry, {
    version,
    rum: config.rum,
    warn: (message) =>
      createLogger('warn')('warn', 'telemetry export problem', { reason: message }),
  });
}
const telemetry = started?.telemetry ?? noopTelemetry;

const log = createLogger(config.logLevel, telemetry);
const { server } = await createApp({
  maxRooms: config.maxRooms,
  trustProxy: config.trustProxy,
  log,
  telemetry,
  rum: config.rum,
});
await server.listen({ port: config.port, host: config.host });
const { telemetry: settings, ...listening } = config;
log('info', 'listening', { ...listening, telemetry: settings !== null });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log('info', 'shutting down', { signal });
    void server
      .close()
      .then(() => started?.shutdown())
      .then(() => process.exit(0));
  });
}
