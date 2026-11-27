import { ROOT_CONTEXT, trace, TraceFlags, type Context } from '@opentelemetry/api';

/** W3C Trace Context, version 00: `00-<trace id>-<parent id>-<flags>`. */
export const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export interface TraceIds {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

/** The ids of a well-formed `traceparent`; undefined for anything else (spec 015). */
export function parseTraceparent(value: unknown): TraceIds | undefined {
  if (typeof value !== 'string') return undefined;
  const match = TRACEPARENT_PATTERN.exec(value);
  if (!match) return undefined;
  const [, traceId, spanId, flags] = match as unknown as [string, string, string, string];
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return undefined;
  return { traceId, spanId, sampled: (parseInt(flags, 16) & TraceFlags.SAMPLED) !== 0 };
}

/** A context whose parent is the span a browser named; undefined when the value is malformed. */
export function remoteParent(value: unknown): Context | undefined {
  const ids = parseTraceparent(value);
  if (!ids) return undefined;
  return trace.setSpanContext(ROOT_CONTEXT, {
    traceId: ids.traceId,
    spanId: ids.spanId,
    traceFlags: ids.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
    isRemote: true,
  });
}
