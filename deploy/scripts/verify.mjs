#!/usr/bin/env node
// Checks a deployed demo from the outside (spec 016): pods, Routes, a real
// game over wss:// with a reconnect, and the telemetry that game produced.
//
// Usage: node deploy/scripts/verify.mjs --namespace <ns> [--release kritzel]
//                                       [--summary <file>] [--traffic "<command>"]
//
// `oc` must be logged in (KUBECONFIG). The Grafana admin password is read
// from GRAFANA_ADMIN_PASSWORD or from the release's Secret; it is used for
// requests and never printed. Nothing is changed in the cluster.
//
// Exit code 0 only when every check passed. With --summary the results are
// also appended to that file as Markdown (the workflow passes its step summary).
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index].replace(/^--/, ''), process.argv[index + 1] ?? '');
}
const namespace = args.get('namespace') ?? process.env.OPENSHIFT_NAMESPACE ?? '';
const release = args.get('release') ?? 'kritzel';
const summaryFile = args.get('summary') ?? '';
const root = fileURLToPath(new URL('../..', import.meta.url));
if (!namespace) {
  console.error('Pass --namespace or set OPENSHIFT_NAMESPACE.');
  process.exit(2);
}

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
}

/** Runs `oc ... --namespace <ns>` and returns its output; never throws. */
function oc(...command) {
  const result = spawnSync('oc', [...command, '--namespace', namespace], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return { ok: result.status === 0, out: result.stdout ?? '', err: result.stderr ?? '' };
}
const json = (result) => {
  try {
    return result.ok ? JSON.parse(result.out) : null;
  } catch {
    return null;
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, timeoutMs, everyMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check().catch(() => null);
    if (value) return value;
    if (Date.now() > deadline) return null;
    await sleep(everyMs);
  }
}

// ── 1. Pods ──────────────────────────────────────────────────────────────
const selector = `app.kubernetes.io/instance=${release}`;
const pods = json(oc('get', 'pods', '--selector', selector, '--output', 'json'))?.items ?? [];
const range =
  json(oc('get', 'namespace', namespace, '--output', 'json'))?.metadata?.annotations?.[
    'openshift.io/sa.scc.uid-range'
  ] ?? '';
const [rangeStart, rangeSize] = range.split('/').map(Number);
const notReady = pods.filter(
  (pod) =>
    pod.status?.phase !== 'Running' ||
    !(pod.status?.containerStatuses ?? []).every((status) => status.ready),
);
record(
  'every pod of the release is running and ready',
  pods.length > 0 && notReady.length === 0,
  `${pods.length - notReady.length} of ${pods.length}`,
);

const sccs = new Set(pods.map((pod) => pod.metadata?.annotations?.['openshift.io/scc']));
record(
  'every pod runs under the restricted-v2 security context constraint',
  pods.length > 0 && sccs.size === 1 && sccs.has('restricted-v2'),
  [...sccs].join(', '),
);
const uids = pods.flatMap((pod) =>
  pod.spec.containers.map((container) => container.securityContext?.runAsUser),
);
record(
  "every container runs with a user id from the namespace's range",
  Number.isFinite(rangeStart) &&
    uids.length > 0 &&
    uids.every((uid) => Number.isInteger(uid) && uid >= rangeStart && uid < rangeStart + rangeSize),
  `range ${range}`,
);

// ── 2. Routes ────────────────────────────────────────────────────────────
const routes = json(oc('get', 'routes', '--selector', selector, '--output', 'json'))?.items ?? [];
const routeOf = (component) =>
  routes.find((route) => route.metadata.labels?.['app.kubernetes.io/component'] === component);
const gameRoute = routeOf('game');
const grafanaRoute = routeOf('grafana');
const gameUrl = gameRoute ? `https://${gameRoute.spec.host}` : '';
const exposed = routes.map((route) => route.metadata.labels?.['app.kubernetes.io/component']);
record(
  'only the game and Grafana have a Route',
  exposed.every((component) => component === 'game' || component === 'grafana'),
  exposed.join(', '),
);
record(
  'the Routes terminate TLS at the edge and redirect HTTP',
  routes.length > 0 &&
    routes.every(
      (route) =>
        route.spec.tls?.termination === 'edge' &&
        route.spec.tls?.insecureEdgeTerminationPolicy === 'Redirect',
    ),
);

if (gameUrl) {
  const page = await fetch(`${gameUrl}/`).catch(() => null);
  const body = page ? await page.text() : '';
  record(
    'the game answers over HTTPS',
    page?.status === 200 && body.includes('<title>Kritzel</title>'),
    `HTTP ${page?.status ?? 'unreachable'}`,
  );
  const health = await fetch(`${gameUrl}/healthz`).catch(() => null);
  record('the health endpoint answers', health?.status === 200);
  const plain = await fetch(`http://${gameRoute.spec.host}/`, { redirect: 'manual' }).catch(
    () => null,
  );
  record(
    'plain HTTP is redirected to HTTPS',
    plain !== null &&
      plain.status >= 300 &&
      plain.status < 400 &&
      (plain.headers.get('location') ?? '').startsWith('https://'),
    `HTTP ${plain?.status ?? 'unreachable'}`,
  );
  const policy = page?.headers.get('content-security-policy') ?? '';
  record(
    'the security headers are present',
    policy.includes("default-src 'self'") &&
      page?.headers.get('x-content-type-options') === 'nosniff',
  );
} else {
  record('the game has a Route', false);
}

// ── 3. A real game through the Route ─────────────────────────────────────
if (gameUrl) {
  // The bundled generator when it was built, the source otherwise.
  const trafficCommand =
    args.get('traffic') ?? 'pnpm --filter @kritzel/server exec tsx src/traffic/main.ts';
  const [command, ...commandArgs] = trafficCommand.split(' ');
  const playedAt = Date.now();
  const game = spawnSync(
    command,
    [
      ...commandArgs,
      '--url',
      gameUrl,
      '--rooms',
      '1',
      '--players',
      '3',
      '--games',
      '1',
      '--pace',
      '150',
      '--seed',
      String(playedAt % 100000),
      '--reconnect',
      'true',
    ],
    { cwd: root, encoding: 'utf8', timeout: 180_000 },
  );
  const output = `${game.stdout ?? ''}${game.stderr ?? ''}`;
  const finished = /"event":"game finished".*"completed":true/.test(output);
  const reconnects = Number(/"event":"game finished".*"reconnects":(\d+)/.exec(output)?.[1] ?? 0);
  record(
    'a complete game is played over wss:// through the Route',
    game.status === 0 && finished,
    finished
      ? '3 players, 3 turns'
      : game.error
        ? `the traffic generator could not be started: ${game.error.message}`
        : 'the game did not reach its results',
  );
  record('a dropped connection resumes its seat during that game', reconnects >= 1);
}

// ── 4. Telemetry and Grafana ─────────────────────────────────────────────
const hasStack = pods.some(
  (pod) => pod.metadata.labels?.['app.kubernetes.io/component'] === 'grafana',
);
let grafanaUrl = '';
if (hasStack) {
  const password =
    process.env.GRAFANA_ADMIN_PASSWORD ||
    Buffer.from(
      json(oc('get', 'secret', `${release}-grafana`, '--output', 'json'))?.data?.[
        'admin-password'
      ] ?? '',
      'base64',
    ).toString('utf8');
  const headers = {
    authorization: `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`,
  };

  if (!grafanaRoute) {
    record(
      'Grafana is checked through its Route',
      false,
      'no Grafana Route; forward its port and run the observability suite with KRITZEL_GRAFANA_URL',
    );
  } else {
    grafanaUrl = `https://${grafanaRoute.spec.host}`;
    const get = async (path, withLogin = true) => {
      const response = await fetch(`${grafanaUrl}${path}`, withLogin ? { headers } : {});
      return { status: response.status, body: await response.json().catch(() => null) };
    };
    const anonymous = await get('/api/search', false).catch(() => ({ status: 0 }));
    record(
      'Grafana refuses anonymous access',
      anonymous.status === 401,
      `HTTP ${anonymous.status}`,
    );

    for (const uid of ['prometheus', 'loki', 'tempo']) {
      const healthy = await until(async () => {
        const health = await get(`/api/datasources/uid/${uid}/health`);
        return health.status === 200 && health.body?.status === 'OK';
      }, 90_000);
      record(`data source ${uid} is healthy`, Boolean(healthy));
    }

    const dashboards = (await get('/api/search?type=dash-db')).body ?? [];
    const expected = [
      'kritzel-overview',
      'kritzel-game',
      'kritzel-websocket',
      'kritzel-runtime',
      'kritzel-security',
      'slo-detail',
      'high-level-sloth-slos',
    ];
    const present = new Set(Array.isArray(dashboards) ? dashboards.map((entry) => entry.uid) : []);
    record(
      'the five dashboards and the two Sloth dashboards are provisioned',
      expected.every((uid) => present.has(uid)),
      `${expected.filter((uid) => present.has(uid)).length} of ${expected.length}`,
    );

    const prometheus = async (query) => {
      const response = await get(
        `/api/datasources/proxy/uid/prometheus/api/v1/query?query=${encodeURIComponent(query)}`,
      );
      return response.body?.data?.result ?? [];
    };
    const metrics = await until(async () => {
      const result = await prometheus(
        'sum(kritzel_games_completed_total{deployment_environment_name!=""})',
      );
      return Number(result[0]?.value?.[1] ?? 0) > 0;
    }, 120_000);
    record('metrics of completed games are in Prometheus', Boolean(metrics));

    const objectives = await until(async () => {
      const result = await prometheus('count(sloth_slo_info{sloth_service="kritzel"})');
      return Number(result[0]?.value?.[1] ?? 0) === 4;
    }, 120_000);
    record('Prometheus evaluates the four service level objectives', Boolean(objectives));

    const logs = await until(async () => {
      const end = Date.now() * 1e6;
      const response = await get(
        `/api/datasources/proxy/uid/loki/loki/api/v1/query_range?query=${encodeURIComponent('{service_name="kritzel"} |= "room created"')}&start=${end - 30 * 60 * 1e9}&end=${end}&limit=5`,
      );
      const streams = response.body?.data?.result ?? [];
      return streams.length > 0 && /^[0-9a-f]{32}$/.test(streams[0].stream?.trace_id ?? '');
    }, 120_000);
    record('log lines with their trace id are in Loki', Boolean(logs));

    const traces = await until(async () => {
      const response = await get(
        `/api/datasources/proxy/uid/tempo/api/search?q=${encodeURIComponent('{ resource.service.name = "kritzel" && name = "room.join" }')}&limit=3`,
      );
      return (response.body?.traces ?? []).length > 0;
    }, 120_000);
    record('traces of joins are in Tempo', Boolean(traces));
  }
}

// ── Summary ──────────────────────────────────────────────────────────────
const failed = results.filter((result) => !result.ok);
if (summaryFile) {
  const lines = [
    '### Checks',
    '',
    '| Check | Result |',
    '| --- | --- |',
    ...results.map(
      (result) =>
        `| ${result.name}${result.detail ? ` (${result.detail})` : ''} | ${result.ok ? 'passed' : '**failed**'} |`,
    ),
    '',
    gameUrl ? `Game: ${gameUrl}` : '',
    grafanaUrl
      ? `Grafana: ${grafanaUrl} (user admin, password from the Secret ${release}-grafana)`
      : hasStack
        ? `Grafana: oc port-forward --namespace ${namespace} service/${release}-grafana 3001:3000`
        : '',
    '',
  ];
  appendFileSync(summaryFile, `${lines.join('\n')}\n`);
}
console.log(
  failed.length === 0
    ? `\nAll ${results.length} checks passed.`
    : `\n${failed.length} of ${results.length} checks failed.`,
);
process.exit(failed.length === 0 ? 0 : 1);
