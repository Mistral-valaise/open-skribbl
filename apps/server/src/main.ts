import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config.js';

function log(level: string, msg: string, context: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...context }));
}

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  log('error', error.message);
  process.exit(1);
}

const { server } = await createApp({ maxRooms: config.maxRooms, trustProxy: config.trustProxy });
await server.listen({ port: config.port, host: config.host });
log('info', 'listening', { host: config.host, port: config.port, maxRooms: config.maxRooms });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log('info', 'shutting down', { signal });
    void server.close().then(() => process.exit(0));
  });
}
