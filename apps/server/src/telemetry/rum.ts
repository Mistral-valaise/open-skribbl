import { RUM, rumReportSchema, type ClientConfig } from '@kritzel/shared';
import type { FastifyInstance } from 'fastify';
import type { Clock } from '../clock.js';
import { TokenBucket } from '../rateLimit.js';
import { SPANS } from './contract.js';
import type { Telemetry } from './telemetry.js';
import { parseTraceparent } from './traceparent.js';

/**
 * Browser measurements (spec 015): tells the web app whether they are
 * offered and, when they are, accepts its reports on the app's own origin.
 * The server re-emits them through the telemetry contract; a browser never
 * talks to a collector and cannot set a resource or a free-form attribute.
 */
export function registerRum(
  server: FastifyInstance,
  { telemetry, clock, enabled }: { telemetry: Telemetry; clock: Clock; enabled: boolean },
): void {
  server.get('/api/config', async (): Promise<ClientConfig> => ({ rum: enabled }));
  if (!enabled) return;

  const buckets = new Map<string, TokenBucket>();
  const refused = (reason: 'rate_limited' | 'invalid_report') =>
    telemetry.count('rumEvents', { 'kritzel.outcome': 'rejected', 'kritzel.reason': reason });

  server.post('/api/telemetry', { bodyLimit: RUM.maxBytes }, async (request, reply) => {
    const now = clock.now();
    let bucket = buckets.get(request.ip);
    if (!bucket) {
      if (buckets.size > 10_000) buckets.clear();
      bucket = new TokenBucket(RUM.reportsPerMinute, RUM.reportsPerMinute / 60, now);
      buckets.set(request.ip, bucket);
    }
    if (!bucket.take(now)) {
      refused('rate_limited');
      telemetry.count('rateLimitHits', { 'kritzel.scope': 'telemetry' });
      return reply.code(429).send({ error: 'rate_limited' });
    }

    const report = rumReportSchema.safeParse(request.body);
    if (!report.success) {
      refused('invalid_report');
      return reply.code(400).send({ error: 'invalid_report' });
    }

    for (const event of report.data.events) {
      switch (event.type) {
        case 'web_vital':
          telemetry.record('rumVital', event.value / 1000, { 'kritzel.rum.vital': event.name });
          break;
        case 'layout_shift':
          telemetry.record('rumLayoutShift', event.value);
          break;
        case 'error':
          telemetry.count('rumErrors', { 'kritzel.rum.error.kind': event.kind });
          break;
        case 'timing': {
          const labels = {
            'kritzel.rum.timing': event.name,
            'kritzel.outcome': event.outcome,
          } as const;
          telemetry.record('rumTiming', event.durationMs / 1000, labels);
          const ids = parseTraceparent(event.traceparent);
          if (ids) {
            telemetry.browserSpan(
              event.name === 'join' ? SPANS.browserJoin : SPANS.browserReconnect,
              ids,
              event.durationMs,
              labels,
            );
          }
          break;
        }
      }
    }
    telemetry.count('rumEvents', { 'kritzel.outcome': 'accepted', 'kritzel.reason': 'none' });
    return reply.code(204).send();
  });
}
