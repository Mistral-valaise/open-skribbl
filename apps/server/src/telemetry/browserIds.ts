import { randomBytes } from 'node:crypto';
import type { TraceIds } from './traceparent.js';

/**
 * Id generator of the tracer that records spans on behalf of browsers
 * (spec 015, "Browser measurements"). A browser picks the ids of its join
 * span before the server sees it; presetting them here makes the reported
 * span the root the server's spans already point to.
 */
export class PresetIdGenerator {
  private next: TraceIds | undefined;

  preset(ids: TraceIds | undefined): void {
    this.next = ids;
  }

  generateTraceId(): string {
    return this.next?.traceId ?? randomBytes(16).toString('hex');
  }

  generateSpanId(): string {
    return this.next?.spanId ?? randomBytes(8).toString('hex');
  }
}
