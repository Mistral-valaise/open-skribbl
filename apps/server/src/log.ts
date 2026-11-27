import type { Logger } from './app.js';
import { noopTelemetry, type LogLevel, type Telemetry } from './telemetry/telemetry.js';

const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/**
 * One JSON object per line on stdout (spec 012, "Logging"), with the ids of
 * the active span when there is one. The same entry is handed to telemetry,
 * which exports it with allowlisted attributes only (spec 015, "Privacy").
 */
export function createLogger(
  minimum: LogLevel,
  telemetry: Telemetry = noopTelemetry,
  write: (line: string) => void = (line) => console.log(line),
): Logger {
  return (level, msg, context = {}) => {
    if (LEVELS.indexOf(level) < LEVELS.indexOf(minimum)) return;
    write(
      JSON.stringify({
        time: new Date().toISOString(),
        level,
        msg,
        ...context,
        ...telemetry.activeIds(),
      }),
    );
    telemetry.log(level, msg, context);
  };
}
