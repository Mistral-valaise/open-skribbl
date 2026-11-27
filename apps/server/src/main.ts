import { createApp, type Logger } from './app.js';
import { ConfigError, loadConfig, type Config } from './config.js';

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/** One JSON object per line on stdout (spec 012, "Logging"). */
function createLogger(minimum: Config['logLevel']): Logger {
  return (level, msg, context = {}) => {
    if (LEVELS.indexOf(level) < LEVELS.indexOf(minimum)) return;
    console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...context }));
  };
}

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  createLogger('error')('error', error.message);
  process.exit(1);
}

const log = createLogger(config.logLevel);
const { server } = await createApp({
  maxRooms: config.maxRooms,
  trustProxy: config.trustProxy,
  log,
});
await server.listen({ port: config.port, host: config.host });
log('info', 'listening', { ...config });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log('info', 'shutting down', { signal });
    void server.close().then(() => process.exit(0));
  });
}
