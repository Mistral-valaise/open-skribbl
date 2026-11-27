import { RUM } from '@kritzel/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../testing/client.js';
import { createTestTelemetry, total, type TestTelemetry } from '../testing/telemetry.js';

let server: TestServer;
let probe: TestTelemetry;
afterEach(async () => {
  await server?.close();
  await probe?.shutdown();
});

async function start(rum: boolean) {
  probe = createTestTelemetry();
  server = await startTestServer({ telemetry: probe.telemetry, rum });
}

const report = (body: unknown, raw = false) =>
  fetch(`${server.url}/api/telemetry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });

describe('browser measurements (spec 015)', () => {
  it('AC-015-24: measurements are not offered and not accepted by default', async () => {
    await start(false);
    expect(await (await fetch(`${server.url}/api/config`)).json()).toEqual({ rum: false });
    const refused = await report({ events: [{ type: 'error', kind: 'error' }] });
    expect(refused.status).toBe(404);

    // The operator's switch needs telemetry: without it the route does not exist either.
    await server.close();
    server = await startTestServer({ rum: true });
    expect(await (await fetch(`${server.url}/api/config`)).json()).toEqual({ rum: false });
    expect((await report({ events: [{ type: 'error', kind: 'error' }] })).status).toBe(404);
  });

  it('AC-015-25: a valid report is accepted and recorded under the contract', async () => {
    await start(true);
    expect(await (await fetch(`${server.url}/api/config`)).json()).toEqual({ rum: true });
    const accepted = await report({
      events: [
        { type: 'web_vital', name: 'lcp', value: 1200 },
        { type: 'web_vital', name: 'inp', value: 80 },
        { type: 'layout_shift', value: 0.04 },
        { type: 'error', kind: 'unhandledrejection' },
        { type: 'timing', name: 'join', outcome: 'ok', durationMs: 250 },
      ],
    });
    expect(accepted.status).toBe(204);
    expect(await accepted.text()).toBe('');

    const points = await probe.metrics();
    const vital = (name: string) =>
      points.find(
        (point) =>
          point.name === 'kritzel.rum.web_vital' && point.labels['kritzel.rum.vital'] === name,
      )!;
    expect(vital('lcp').sum).toBeCloseTo(1.2, 5);
    expect(vital('inp').sum).toBeCloseTo(0.08, 5);
    expect(points.find((point) => point.name === 'kritzel.rum.layout_shift')!.sum).toBeCloseTo(
      0.04,
      5,
    );
    expect(
      total(points, 'kritzel.rum.errors', { 'kritzel.rum.error.kind': 'unhandledrejection' }),
    ).toBe(1);
    expect(
      total(points, 'kritzel.rum.timing', {
        'kritzel.rum.timing': 'join',
        'kritzel.outcome': 'ok',
      }),
    ).toBe(1);
    expect(total(points, 'kritzel.rum.reports', { 'kritzel.outcome': 'accepted' })).toBe(1);
  });

  it('AC-015-26: malformed, oversized and too frequent reports are refused and record nothing', async () => {
    await start(true);
    const bad = [
      { events: [{ type: 'error', kind: 'error', message: 'TypeError: secret' }] },
      { events: [{ type: 'web_vital', name: 'ttfb', value: 1 }] },
      { events: [{ type: 'web_vital', name: 'lcp', value: -1 }] },
      { events: [], page: '/r/ABCDEF' },
      { events: Array(RUM.maxEvents + 1).fill({ type: 'error', kind: 'error' }) },
      { nickname: 'Mara' },
    ];
    for (const body of bad) expect((await report(body)).status).toBe(400);
    const large = await report(
      JSON.stringify({ events: [{ type: 'error', kind: 'error' }], pad: 'x'.repeat(RUM.maxBytes) }),
      true,
    );
    expect(large.status).toBe(413);

    let points = await probe.metrics();
    expect(
      points.filter((point) => /rum\.(web_vital|errors|timing|layout)/.test(point.name)),
    ).toEqual([]);
    expect(total(points, 'kritzel.rum.reports', { 'kritzel.reason': 'invalid_report' })).toBe(
      bad.length,
    );
    expect(JSON.stringify(points)).not.toContain('secret');

    // The budget is per minute and address. The malformed reports spent some of
    // it; the oversized one was refused before it was read. The 31st is refused.
    const statuses: number[] = [];
    for (let count = bad.length; count < RUM.reportsPerMinute + 1; count += 1) {
      statuses.push((await report({ events: [{ type: 'error', kind: 'error' }] })).status);
    }
    expect(statuses.slice(0, -1).every((status) => status === 204)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    points = await probe.metrics();
    expect(total(points, 'kritzel.rate_limit.hits', { 'kritzel.scope': 'telemetry' })).toBe(1);
  });

  it('AC-015-28: a join with a traceparent joins the browser trace, and the report adds its root span', async () => {
    await start(true);
    const code = await server.createRoom();
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const spanId = '00f067aa0ba902b7';
    const traceparent = `00-${traceId}-${spanId}-01`;
    const mara = await server.connect();
    await mara.join(code, 'Mara', { traceparent });

    const join = probe.spans().find((span) => span.name === 'room.join')!;
    const message = probe.spans().find((span) => span.name === 'ws join')!;
    expect(join.spanContext().traceId).toBe(traceId);
    expect(message.spanContext().traceId).toBe(traceId);
    expect(message.parentSpanContext?.spanId).toBe(spanId);

    const accepted = await report({
      events: [{ type: 'timing', name: 'join', outcome: 'ok', durationMs: 180, traceparent }],
    });
    expect(accepted.status).toBe(204);
    const [root] = probe.browserSpans();
    expect(root!.name).toBe('browser.join');
    expect(root!.spanContext().traceId).toBe(traceId);
    expect(root!.spanContext().spanId).toBe(spanId);
    expect(root!.parentSpanContext).toBeUndefined();
    const millis = root!.duration[0] * 1000 + root!.duration[1] / 1e6;
    expect(millis).toBeCloseTo(180, 0);

    // A malformed value is ignored: the join gets a trace of its own and the report no span.
    const noa = await server.connect();
    await noa.join(code, 'Noa', { traceparent: '00-zz-not-a-trace-01' });
    const second = probe.spans().filter((span) => span.name === 'ws join')[1]!;
    expect(second.spanContext().traceId).not.toBe(traceId);
    expect(second.parentSpanContext).toBeUndefined();
    await report({
      events: [{ type: 'timing', name: 'join', outcome: 'ok', durationMs: 5, traceparent: 'x' }],
    });
    expect(probe.browserSpans()).toHaveLength(1);
  });

  it('AC-015-28: without the operator switch a traceparent on join is ignored', async () => {
    await start(false);
    const code = await server.createRoom();
    const mara = await server.connect();
    await mara.join(code, 'Mara', {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    });
    const message = probe.spans().find((span) => span.name === 'ws join')!;
    expect(message.spanContext().traceId).not.toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });
});
