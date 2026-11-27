import { RUM } from './constants.js';
import { z } from './zod.js';

const duration = z.number().min(0).max(RUM.maxDurationMs);

/**
 * A browser's measurement report (spec 015, "Browser measurements"). Strict:
 * a report with any field that is not listed here is refused, so nothing but
 * these numbers and fixed words can be sent.
 */
export const rumReportSchema = z.strictObject({
  events: z
    .array(
      z.discriminatedUnion('type', [
        // Largest Contentful Paint and Interaction to Next Paint, in milliseconds.
        z.strictObject({
          type: z.literal('web_vital'),
          name: z.enum(['lcp', 'inp']),
          value: duration,
        }),
        // Cumulative Layout Shift, a unitless score.
        z.strictObject({ type: z.literal('layout_shift'), value: z.number().min(0).max(100) }),
        // A script error: its kind only, never the message or the stack.
        z.strictObject({ type: z.literal('error'), kind: z.enum(['error', 'unhandledrejection']) }),
        z.strictObject({
          type: z.literal('timing'),
          name: z.enum(['join', 'reconnect']),
          outcome: z.enum(['ok', 'failed']),
          durationMs: duration,
          /** The `traceparent` the join carried, so the server can add the browser's span. */
          traceparent: z.string().max(64).optional(),
        }),
      ]),
    )
    .min(1)
    .max(RUM.maxEvents),
});
export type RumReport = z.infer<typeof rumReportSchema>;
export type RumEvent = RumReport['events'][number];

/** Answer of `GET /api/config`. */
export interface ClientConfig {
  /** The operator offers browser measurements; the player still has to switch them on. */
  rum: boolean;
}
