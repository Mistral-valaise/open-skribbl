import {
  monitorEventLoopDelay,
  performance,
  PerformanceObserver,
  constants,
} from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import type { Telemetry } from './telemetry.js';

/** Sampling interval of the event-loop delay monitor. */
export const EVENT_LOOP_RESOLUTION_MS = 20;

const GC_TYPES: Record<number, string> = {
  [constants.NODE_PERFORMANCE_GC_MAJOR]: 'major',
  [constants.NODE_PERFORMANCE_GC_MINOR]: 'minor',
  [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: 'incremental',
  [constants.NODE_PERFORMANCE_GC_WEAKCB]: 'weakcb',
};

/**
 * Process and runtime metrics (spec 015): memory, CPU, garbage collection
 * and event-loop delay. Read from `perf_hooks` and `process`, which need no
 * module patching. Returns a function that stops the observers.
 */
export function instrumentRuntime(telemetry: Telemetry): () => void {
  telemetry.observe('processMemory', () => process.memoryUsage.rss());
  telemetry.observe('heapUsed', () => process.memoryUsage().heapUsed);
  telemetry.observe('heapLimit', () => getHeapStatistics().heap_size_limit);
  telemetry.observe('cpuTime', () => {
    const usage = process.cpuUsage();
    return [
      [usage.user / 1e6, { 'cpu.mode': 'user' }],
      [usage.system / 1e6, { 'cpu.mode': 'system' }],
    ] as const;
  });

  // Percentiles cover the time since the previous export; `max` resets the window.
  // The histogram records the time between samples, which includes the sampling
  // interval itself; that interval is subtracted, so an idle loop reports about zero.
  const delay = monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS });
  delay.enable();
  const seconds = (nanoseconds: number) =>
    Number.isFinite(nanoseconds)
      ? Math.max(0, nanoseconds / 1e9 - EVENT_LOOP_RESOLUTION_MS / 1000)
      : 0;
  telemetry.observe('eventLoopDelayP50', () => seconds(delay.percentile(50)));
  telemetry.observe('eventLoopDelayP99', () => seconds(delay.percentile(99)));
  telemetry.observe('eventLoopDelayMax', () => {
    const max = seconds(delay.max);
    delay.reset();
    return max;
  });

  let utilization = performance.eventLoopUtilization();
  telemetry.observe('eventLoopUtilization', () => {
    const current = performance.eventLoopUtilization();
    const share = performance.eventLoopUtilization(current, utilization).utilization;
    utilization = current;
    return share;
  });

  const gc = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const kind = (entry as unknown as { detail?: { kind?: number } }).detail?.kind;
      telemetry.record('gcDuration', entry.duration / 1000, {
        'v8js.gc.type': GC_TYPES[kind ?? -1] ?? 'other',
      });
    }
  });
  gc.observe({ entryTypes: ['gc'] });

  return () => {
    delay.disable();
    gc.disconnect();
  };
}
