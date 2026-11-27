import { SpanKind, SpanStatusCode, type Span } from '@opentelemetry/api';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { boundedLabels, spanNameForHttp, type Labels } from './contract.js';
import type { Telemetry } from './telemetry.js';

interface Pending {
  span: Span;
  startedAt: number;
}

/** The route template of a request; never the path a client sent (spec 015, "Privacy"). */
function routeOf(request: FastifyRequest): string {
  // The not-found handler and the static file wildcard have no template worth a label.
  if (request.is404) return 'unmatched';
  return request.routeOptions.url ?? 'unmatched';
}

/**
 * Measures every HTTP request and gives it a server span (spec 015). Uses
 * Fastify hooks rather than module patching, which the single-file bundle
 * would bypass (ADR 0006).
 */
export function instrumentHttp(server: FastifyInstance, telemetry: Telemetry): HttpTelemetry {
  const pending = new WeakMap<FastifyRequest, Pending>();

  server.addHook('onRequest', async (request) => {
    // The upgrade never gets a response; WebSocket traffic is measured per message.
    if (request.routeOptions.url === '/ws') return;
    pending.set(request, {
      startedAt: telemetry.now(),
      // Named and labelled once the route is known.
      span: telemetry.startSpan('HTTP', { kind: SpanKind.SERVER }),
    });
  });

  server.addHook('onResponse', async (request, reply) => {
    const entry = pending.get(request);
    if (!entry) return;
    pending.delete(request);
    const route = routeOf(request);
    const labels: Labels = {
      'http.request.method': request.method,
      'http.route': route,
      'http.response.status_code': reply.statusCode,
    };
    telemetry.record('httpDuration', (telemetry.now() - entry.startedAt) / 1000, labels);
    entry.span.updateName(spanNameForHttp(request.method, route));
    entry.span.setAttributes(boundedLabels(labels));
    if (reply.statusCode >= 500) entry.span.setStatus({ code: SpanStatusCode.ERROR });
    entry.span.end();
  });

  return {
    within: (request, fn) => telemetry.within(pending.get(request)?.span, fn),
  };
}

export interface HttpTelemetry {
  /** Runs a handler's work with the request's span active, so child spans and log lines join its trace. */
  within<T>(request: FastifyRequest, fn: () => T): T;
}
