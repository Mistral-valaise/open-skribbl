import { context } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

let enabled = false;

/**
 * Makes the active span follow asynchronous work, so a log line written in a
 * request handler knows its trace. Process-wide and idempotent; only called
 * when telemetry is on (and by tests).
 */
export function enableContextPropagation(): void {
  if (enabled) return;
  enabled = context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
}
