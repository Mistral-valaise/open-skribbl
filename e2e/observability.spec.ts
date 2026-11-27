import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Checks of the local observability stack (spec 015) against its real APIs.
 * They run only against a stack started outside the test run:
 *
 *   pnpm obs:up && KRITZEL_OBS=1 pnpm exec playwright test e2e/observability.spec.ts
 *
 * or against a deployment on OpenShift (spec 016), logged in with `oc`:
 *
 *   KRITZEL_OBS=1 KRITZEL_OPENSHIFT_NAMESPACE=<ns> KRITZEL_GRAFANA_URL=https://<grafana route> \\
 *     KRITZEL_GRAFANA_PASSWORD=… pnpm exec playwright test e2e/observability.spec.ts
 *
 * Everything is asked through Grafana's data source proxy, because Grafana is
 * the only published port. The data is produced by the production image and
 * the bundled traffic generator; nothing is fabricated.
 */
const enabled = process.env.KRITZEL_OBS === '1';
const grafana = process.env.KRITZEL_GRAFANA_URL ?? 'http://127.0.0.1:3001';
const root = fileURLToPath(new URL('..', import.meta.url));
const envFile = `${root}.env.observability`;

function adminPassword(): string {
  if (process.env.KRITZEL_GRAFANA_PASSWORD) return process.env.KRITZEL_GRAFANA_PASSWORD;
  if (!existsSync(envFile)) return '';
  const line = readFileSync(envFile, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith('GRAFANA_ADMIN_PASSWORD='));
  return line?.slice('GRAFANA_ADMIN_PASSWORD='.length) ?? '';
}
const headers = {
  authorization: `Basic ${Buffer.from(`admin:${adminPassword()}`).toString('base64')}`,
};

/**
 * Where the game runs. By default the Compose project; with
 * KRITZEL_OPENSHIFT_NAMESPACE set, the Helm release in that namespace (spec
 * 016), reached with `oc` and the current login.
 */
const openshiftNamespace = process.env.KRITZEL_OPENSHIFT_NAMESPACE;
const collectorHost = openshiftNamespace ? 'kritzel-collector' : 'otel-collector';

/** Runs a command in the game container. */
function inGame(...command: string[]): string {
  const [program, args] = openshiftNamespace
    ? ['oc', ['exec', '--namespace', openshiftNamespace, 'deployment/kritzel', '--', ...command]]
    : [
        'docker',
        [
          'compose',
          '--env-file',
          envFile,
          '-f',
          'docker-compose.yml',
          '-f',
          'docker-compose.observability.yml',
          'exec',
          '-T',
          'kritzel',
          ...command,
        ],
      ];
  return execFileSync(program as string, args as string[], {
    cwd: root,
    encoding: 'utf8',
    timeout: 240_000,
  });
}

type Sample = { metric: Record<string, string>; value: [number, string] };

async function prometheus(request: APIRequestContext, query: string): Promise<Sample[]> {
  const response = await request.get(
    `${grafana}/api/datasources/proxy/uid/prometheus/api/v1/query`,
    {
      headers,
      params: { query },
    },
  );
  expect(response.status(), query).toBe(200);
  return ((await response.json()) as { data: { result: Sample[] } }).data.result;
}

interface LogLine {
  line: string;
  metadata: Record<string, string>;
}

async function loki(request: APIRequestContext, query: string): Promise<LogLine[]> {
  const end = Date.now();
  const response = await request.get(
    `${grafana}/api/datasources/proxy/uid/loki/loki/api/v1/query_range`,
    {
      headers,
      params: {
        query,
        start: String((end - 60 * 60_000) * 1e6),
        end: String(end * 1e6),
        limit: '50',
      },
    },
  );
  expect(response.status(), query).toBe(200);
  const body = (await response.json()) as {
    data: { result: { stream: Record<string, string>; values: [string, string][] }[] };
  };
  return body.data.result.flatMap((stream) =>
    stream.values.map(([, line]) => ({ line, metadata: stream.stream })),
  );
}

interface TraceSpan {
  name: string;
  attributes: Record<string, unknown>;
  resource: Record<string, unknown>;
}

/** The spans of a trace, or null while Tempo does not have it yet. */
async function trace(request: APIRequestContext, traceId: string): Promise<TraceSpan[] | null> {
  const response = await request.get(
    `${grafana}/api/datasources/proxy/uid/tempo/api/traces/${traceId}`,
    { headers },
  );
  if (response.status() !== 200) return null;
  const flat = (attributes: { key: string; value: Record<string, unknown> }[] = []) =>
    Object.fromEntries(attributes.map(({ key, value }) => [key, Object.values(value)[0]]));
  const body = (await response.json()) as {
    batches?: {
      resource?: { attributes?: { key: string; value: Record<string, unknown> }[] };
      scopeSpans?: { spans?: { name: string; attributes?: never[] }[] }[];
    }[];
  };
  return (body.batches ?? []).flatMap((batch) =>
    (batch.scopeSpans ?? []).flatMap((scope) =>
      (scope.spans ?? []).map((span) => ({
        name: span.name,
        attributes: flat(span.attributes),
        resource: flat(batch.resource?.attributes),
      })),
    ),
  );
}

// On OpenShift the same checks prove AC-016-24: the stack works there as it does in Compose.
test.describe('observability stack', () => {
  test.skip(!enabled, 'needs a running stack and KRITZEL_OBS=1');
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  test('AC-015-31: Grafana has the three data sources and reports each as healthy', async ({
    request,
  }) => {
    for (const uid of ['prometheus', 'loki', 'tempo']) {
      const source = await request.get(`${grafana}/api/datasources/uid/${uid}`, { headers });
      expect(source.status(), uid).toBe(200);
      expect(((await source.json()) as { type: string }).type).toBe(uid);
      await expect
        .poll(
          async () => {
            const health = await request.get(`${grafana}/api/datasources/uid/${uid}/health`, {
              headers,
            });
            return health.ok() ? ((await health.json()) as { status: string }).status : 'down';
          },
          { timeout: 120_000, message: uid },
        )
        .toBe('OK');
    }
    // No anonymous access.
    expect((await request.get(`${grafana}/api/search`)).status()).toBe(401);
  });

  test('AC-015-32, AC-015-43: the five dashboards and the two Sloth dashboards are provisioned', async ({
    request,
  }) => {
    const response = await request.get(`${grafana}/api/search`, {
      headers,
      params: { type: 'dash-db' },
    });
    const uids = ((await response.json()) as { uid: string }[]).map((entry) => entry.uid);
    for (const uid of [
      'kritzel-overview',
      'kritzel-game',
      'kritzel-websocket',
      'kritzel-runtime',
      'kritzel-security',
      'slo-detail',
      'high-level-sloth-slos',
    ]) {
      expect(uids, uid).toContain(uid);
    }
  });

  test('AC-015-39: the bundled traffic generator plays a full game against the production image', async () => {
    const seed = String(randomBytes(2).readUInt16BE(0));
    const output = inGame(
      'node',
      'traffic.js',
      '--url',
      'http://127.0.0.1:3000',
      '--rooms',
      '1',
      '--players',
      '3',
      '--games',
      '1',
      '--pace',
      '50',
      '--seed',
      seed,
    );
    expect(output).toContain('"completed":true');
    expect(output).toContain('"failed":0');
  });

  test('AC-015-02, AC-015-33: Prometheus holds the application metrics under their documented names', async ({
    request,
  }) => {
    const names = [
      'kritzel_rooms_active',
      'kritzel_players_connected',
      'kritzel_ws_connections_active',
      'kritzel_rooms_create_attempts_total',
      'kritzel_join_attempts_total',
      'kritzel_games_started_total',
      'kritzel_games_completed_total',
      'kritzel_turns_ended_total',
      'kritzel_guesses_total',
      'kritzel_ws_messages_total',
      'kritzel_game_duration_seconds_bucket',
      'kritzel_ws_message_duration_seconds_bucket',
      'kritzel_join_duration_seconds_bucket',
      'kritzel_drawing_relay_duration_seconds_bucket',
      'http_server_request_duration_seconds_bucket',
      'process_memory_usage_bytes',
      'v8js_memory_heap_used_bytes',
      'process_cpu_time_seconds_total',
      'nodejs_eventloop_delay_p99_seconds',
      'kritzel_span_calls_total',
      'kritzel_span_duration_seconds_bucket',
    ];
    for (const name of names) {
      await expect
        .poll(
          async () => (await prometheus(request, `count(${name}{service_name="kritzel"})`)).length,
          {
            timeout: 120_000,
            message: name,
          },
        )
        .toBe(1);
    }
    // The service identity is on every series, and nothing else from the resource.
    const [sample] = await prometheus(request, 'kritzel_rooms_active');
    expect(Object.keys(sample!.metric).sort()).toEqual([
      '__name__',
      'deployment_environment_name',
      'instance',
      'job',
      'otel_scope_name',
      'otel_scope_version',
      'service_instance_id',
      'service_name',
      'service_version',
    ]);
  });

  test('AC-015-02, AC-015-34: Loki holds the log lines with trace ids as metadata, Tempo the traces', async ({
    request,
  }) => {
    await expect
      .poll(
        async () => (await loki(request, '{service_name="kritzel"} |= "room created"')).length,
        {
          timeout: 120_000,
        },
      )
      .toBeGreaterThan(0);
    const labels = await request.get(
      `${grafana}/api/datasources/proxy/uid/loki/loki/api/v1/labels`,
      {
        headers,
      },
    );
    const index = ((await labels.json()) as { data: string[] }).data;
    expect(index).toEqual(expect.arrayContaining(['service_name', 'deployment_environment_name']));
    expect(index).not.toContain('trace_id');
    expect(index).not.toContain('room');

    const [line] = await loki(request, '{service_name="kritzel"} |= "room created"');
    expect(line!.metadata.trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(line!.metadata.span_id).toMatch(/^[0-9a-f]{16}$/);
    expect(line!.metadata.room).toBeUndefined();

    const search = await request.get(`${grafana}/api/datasources/proxy/uid/tempo/api/search`, {
      headers,
      params: { q: '{ resource.service.name = "kritzel" && name = "room.join" }', limit: '5' },
    });
    expect(search.status()).toBe(200);
    expect(((await search.json()) as { traces: unknown[] }).traces.length).toBeGreaterThan(0);
  });

  test('AC-015-35: one operation can be followed from metric to trace to logs and back', async ({
    request,
  }) => {
    // A fresh operation, so the evidence below belongs to this run.
    const created = inGame(
      'node',
      '-e',
      "fetch('http://127.0.0.1:3000/api/rooms',{method:'POST'}).then(r=>console.log(r.status))",
    );
    expect(created.trim()).toBe('201');
    const startedAt = Date.now() / 1000 - 30;

    // 1. Metric -> trace: an exemplar on the span-duration histogram names a trace.
    let traceId = '';
    await expect
      .poll(
        async () => {
          const response = await request.get(
            `${grafana}/api/datasources/proxy/uid/prometheus/api/v1/query_exemplars`,
            {
              headers,
              params: {
                query: 'kritzel_span_duration_seconds_bucket{span_name="room.create"}',
                start: String(startedAt),
                end: String(Date.now() / 1000 + 5),
              },
            },
          );
          const series = (
            (await response.json()) as {
              data: { exemplars: { labels: Record<string, string> }[] }[];
            }
          ).data;
          traceId = series.flatMap((entry) => entry.exemplars).at(-1)?.labels.trace_id ?? '';
          return traceId;
        },
        { timeout: 120_000, message: 'an exemplar for room.create' },
      )
      .toMatch(/^[0-9a-f]{32}$/);

    let spans: TraceSpan[] | null = null;
    await expect
      .poll(async () => (spans = await trace(request, traceId))?.map((span) => span.name) ?? [], {
        timeout: 60_000,
        message: `trace ${traceId} in Tempo`,
      })
      .toEqual(expect.arrayContaining(['room.create', 'POST /api/rooms']));

    // 2. Trace -> logs: the lines written inside that trace, with the data source's query.
    const service = spans!.find((span) => span.name === 'room.create')!.resource['service.name'];
    const lines = await loki(
      request,
      `{service_name="${String(service)}"} | trace_id="${traceId}"`,
    );
    expect(lines.map((entry) => entry.line)).toContain('room created');

    // 3. Log -> trace: the id a log line carries resolves in Tempo.
    const fromLog = lines[0]!.metadata.trace_id!;
    expect(fromLog).toBe(traceId);
    expect(await trace(request, fromLog)).not.toBeNull();

    // 4. Trace -> metrics: the span's operation has rate and duration series.
    const rate = await prometheus(
      request,
      `sum(rate(kritzel_span_calls_total{service_name="${String(service)}", span_name="room.create"}[15m]))`,
    );
    expect(Number(rate[0]!.value[1])).toBeGreaterThan(0);
    const p95 = await prometheus(
      request,
      `histogram_quantile(0.95, sum by (le) (rate(kritzel_span_duration_seconds_bucket{service_name="${String(service)}", span_name="room.create"}[15m])))`,
    );
    expect(Number(p95[0]!.value[1])).toBeGreaterThan(0);
    console.log(
      `correlation evidence: trace ${traceId}, ${spans!.length} spans, ${lines.length} log line(s)`,
    );
  });

  test('AC-015-37: the collector removes attributes that are not on the allowlist', async ({
    request,
  }) => {
    const traceId = randomBytes(16).toString('hex');
    const spanId = randomBytes(8).toString('hex');
    const sentinel = `sentinel-${randomBytes(6).toString('hex')}`;
    const now = `${Date.now()}000000`;
    const resource = {
      attributes: [
        { key: 'service.name', value: { stringValue: 'kritzel-allowlist-check' } },
        { key: 'host.name', value: { stringValue: sentinel } },
      ],
    };
    const attributes = [
      { key: 'kritzel.outcome', value: { stringValue: 'ok' } },
      { key: 'nickname', value: { stringValue: sentinel } },
      { key: 'url.full', value: { stringValue: `https://example.invalid/r/${sentinel}` } },
    ];
    const traces = {
      resourceSpans: [
        {
          resource,
          scopeSpans: [
            {
              spans: [
                {
                  traceId,
                  spanId,
                  name: 'allowlist.check',
                  kind: 1,
                  startTimeUnixNano: now,
                  endTimeUnixNano: now,
                  attributes,
                },
              ],
            },
          ],
        },
      ],
    };
    const logs = {
      resourceLogs: [
        {
          resource,
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: now,
                  severityNumber: 9,
                  severityText: 'INFO',
                  body: { stringValue: 'allowlist check' },
                  traceId,
                  spanId,
                  attributes: [
                    { key: 'rooms', value: { intValue: '1' } },
                    { key: 'room', value: { stringValue: sentinel } },
                    { key: 'nickname', value: { stringValue: sentinel } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    // The collector is reachable only inside the Compose network.
    const script = `
      const send = (path, body) => fetch('http://${collectorHost}:4318' + path, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }).then((response) => response.status);
      Promise.all([send('/v1/traces', ${JSON.stringify(traces)}), send('/v1/logs', ${JSON.stringify(logs)})])
        .then((statuses) => console.log(statuses.join(',')));`;
    expect(inGame('node', '-e', script).trim()).toBe('200,200');

    let spans: TraceSpan[] | null = null;
    await expect
      .poll(async () => (spans = await trace(request, traceId))?.length ?? 0, { timeout: 90_000 })
      .toBe(1);
    expect(spans![0]!.attributes).toEqual({ 'kritzel.outcome': 'ok' });
    expect(spans![0]!.resource).toEqual({ 'service.name': 'kritzel-allowlist-check' });

    let lines: LogLine[] = [];
    await expect
      .poll(
        async () =>
          (lines = await loki(request, '{service_name="kritzel-allowlist-check"}')).length,
        { timeout: 90_000 },
      )
      .toBeGreaterThan(0);
    const stored = JSON.stringify({ spans, lines });
    expect(stored).not.toContain(sentinel);
    expect(lines.at(-1)!.metadata.rooms).toBe('1');
    expect(lines.at(-1)!.metadata.nickname).toBeUndefined();
  });

  test('AC-015-43: Prometheus evaluates the Sloth rules for every objective', async ({
    request,
  }) => {
    const objectives = [
      'join-success',
      'ws-processing-latency',
      'reconnect-latency',
      'api-availability',
    ];
    await expect
      .poll(
        async () =>
          (await prometheus(request, 'sloth_slo_info{sloth_service="kritzel"}'))
            .map((sample) => sample.metric.sloth_slo)
            .sort(),
        { timeout: 120_000 },
      )
      .toEqual([...objectives].sort());
    const targets = await prometheus(request, 'slo:objective:ratio{sloth_service="kritzel"}');
    expect(
      Object.fromEntries(targets.map((sample) => [sample.metric.sloth_slo, sample.value[1]])),
    ).toEqual({
      'join-success': '0.9990000000000001',
      'ws-processing-latency': '0.99',
      'reconnect-latency': '0.99',
      'api-availability': '0.9990000000000001',
    });
    // Objectives that had traffic in this run have a measured error ratio.
    for (const slo of ['join-success', 'ws-processing-latency', 'api-availability']) {
      await expect
        .poll(
          async () =>
            (await prometheus(request, `slo:sli_error:ratio_rate5m{sloth_slo="${slo}"}`)).length,
          { timeout: 180_000, message: slo },
        )
        .toBe(1);
    }
    const rules = await request.get(
      `${grafana}/api/datasources/proxy/uid/prometheus/api/v1/rules`,
      {
        headers,
      },
    );
    const groups = ((await rules.json()) as { data: { groups: { rules: { health: string }[] }[] } })
      .data.groups;
    expect(groups.flatMap((group) => group.rules).filter((rule) => rule.health === 'err')).toEqual(
      [],
    );
  });
});
