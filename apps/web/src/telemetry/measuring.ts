import { RUM } from '@kritzel/shared';
import type { AttemptTiming } from '../connection/roomConnection.js';
import { Reporter, type ReporterEnv } from './reporter.js';
import { createTraceparent, type RandomBytes } from './traceparent.js';
import { observeVitals, type PerformanceObserverConstructor } from './vitals.js';

/**
 * Browser measurements while the player has them switched on (spec 015):
 * the vitals of the page view, script errors by kind, and the time joins and
 * reconnects take. Starting attaches the observers and listeners; stopping
 * removes every one of them and forgets what was not sent.
 */

/** The browser as far as measuring needs it; tests supply stand-ins. */
export interface MeasuringEnv extends ReporterEnv {
  /** Receives `error`, `unhandledrejection` and `pagehide`. */
  window: EventTarget;
  /** Receives `visibilitychange`. */
  document: EventTarget & { readonly visibilityState: string };
  /** Missing in a browser without performance observers. */
  PerformanceObserver: PerformanceObserverConstructor | undefined;
  /** Shared by every start within one page view. */
  pageView: { vitalsReported: boolean };
  random?: RandomBytes;
}

export interface Measuring {
  /**
   * Starts timing an attempt; to be called when its socket is opened. The
   * `traceparent` goes into the `join` message and into the timing event.
   */
  timing(name: 'join' | 'reconnect'): AttemptTiming;
  stop(): void;
}

/** Script errors counted in one page view; a page that fails in a loop would never stop. */
const ERROR_LIMIT = RUM.maxEvents / 2;

export function startMeasuring(env: MeasuringEnv): Measuring {
  const reporter = new Reporter(env);
  // The vitals of a page view are reported once: a report has no identifier a later one could replace.
  const vitals = env.pageView.vitalsReported ? null : observeVitals(env.PerformanceObserver);
  let stopped = false;
  let errors = 0;

  const onHidden = () => {
    if (vitals && !env.pageView.vitalsReported) {
      env.pageView.vitalsReported = true;
      for (const event of vitals.take()) reporter.add(event);
      vitals.stop();
    }
    reporter.flush();
  };
  const onVisibilityChange = () => {
    if (env.document.visibilityState === 'hidden') onHidden();
  };
  // Only the kind is read; the event's message, source and stack are never touched.
  const countError = (kind: 'error' | 'unhandledrejection') => () => {
    if (errors >= ERROR_LIMIT) return;
    errors += 1;
    reporter.add({ type: 'error', kind });
  };
  const onError = countError('error');
  const onRejection = countError('unhandledrejection');

  env.document.addEventListener('visibilitychange', onVisibilityChange);
  env.window.addEventListener('pagehide', onHidden);
  env.window.addEventListener('error', onError);
  env.window.addEventListener('unhandledrejection', onRejection);

  return {
    timing(name) {
      const traceparent = createTraceparent(env.random);
      const startedAt = env.now();
      let settled = false;
      return {
        traceparent,
        settle(outcome) {
          if (settled || stopped) return;
          settled = true;
          const durationMs = Math.round(env.now() - startedAt);
          reporter.add({ type: 'timing', name, outcome, durationMs, traceparent });
          reporter.flushSoon();
        },
      };
    },
    stop() {
      stopped = true;
      env.document.removeEventListener('visibilitychange', onVisibilityChange);
      env.window.removeEventListener('pagehide', onHidden);
      env.window.removeEventListener('error', onError);
      env.window.removeEventListener('unhandledrejection', onRejection);
      vitals?.stop();
      reporter.discard();
    },
  };
}
