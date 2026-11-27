import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  LABEL_VALUES,
  LOG_ATTRIBUTE_ALLOWLIST,
  METRICS,
} from '../apps/server/src/telemetry/contract.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8');
const OBS = 'deploy/helm/kritzel/files';
const PROMETHEUS_IMAGE =
  'prom/prometheus:v3.16.0@sha256:e04987641b57704f408e31f6373ba4138ecf27cb4a165d24aabb6c38fddd0f06';

/** Runs promtool: the local binary when there is one, the pinned image otherwise. */
function promtool(...args: string[]): { status: number | null; output: string } {
  const local = spawnSync('promtool', ['--version']).status === 0;
  const result = local
    ? spawnSync('promtool', args, { cwd: root, encoding: 'utf8' })
    : spawnSync(
        'docker',
        [
          'run',
          '--rm',
          '--entrypoint',
          'promtool',
          '-v',
          `${root}${OBS}:/obs:ro`,
          '-w',
          '/',
          PROMETHEUS_IMAGE,
        ].concat(args.map((arg) => arg.replace(OBS, '/obs'))),
        { encoding: 'utf8' },
      );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

interface Dashboard {
  uid: string;
  title: string;
  tags: string[];
  panels: {
    title: string;
    type: string;
    targets?: { expr?: string; datasource?: { type: string } }[];
  }[];
}
const dashboards = readdirSync(`${root}${OBS}/grafana/dashboards`)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({
    name,
    json: JSON.parse(read(`${OBS}/grafana/dashboards/${name}`)) as Dashboard,
  }));

/** Metric names a dashboard or rule may query. */
function knownMetrics(): Set<string> {
  const known = new Set<string>(['up']);
  for (const metric of Object.values(METRICS)) {
    if (metric.kind === 'histogram') {
      for (const suffix of ['_bucket', '_count', '_sum'])
        known.add(`${metric.prometheus}${suffix}`);
    } else {
      known.add(metric.prometheus);
    }
  }
  // Derived from spans by the collector's span-metrics connector.
  for (const name of [
    'calls_total',
    'duration_seconds_bucket',
    'duration_seconds_count',
    'duration_seconds_sum',
  ]) {
    known.add(`kritzel_span_${name}`);
  }
  // The SDK's and the collector's own metrics, and what the collector keeps from the backends.
  const collector = read(`${OBS}/collector/config.yaml`);
  for (const match of collector.matchAll(/regex: (\S+)/g)) {
    for (const name of match[1]!.split('|')) known.add(name);
  }
  for (const rules of ['sloth-kritzel.yaml']) {
    for (const match of read(`${OBS}/prometheus/rules/${rules}`).matchAll(/record: (\S+)/g)) {
      known.add(match[1]!);
    }
  }
  return known;
}

const labelNames = new Set(
  [...Object.keys(LABEL_VALUES), 'http.response.status_code'].map((name) =>
    name.replace(/\./g, '_'),
  ),
);
const PREFIX =
  /^(kritzel_|http_server_|process_|v8js_|nodejs_|otel_sdk_|otelcol_|slo:|sloth_slo|prometheus_|loki_|tempo_|grafana_)/;

/** Metric names used in a PromQL expression: prefixed identifiers that are not label names. */
function metricsIn(expr: string): string[] {
  const withoutStrings = expr.replace(/"[^"]*"/g, '""');
  return [...withoutStrings.matchAll(/[a-zA-Z_:][a-zA-Z0-9_:]*/g)]
    .map((match) => match[0])
    .filter((token) => PREFIX.test(token) && !labelNames.has(token) && !token.startsWith('sloth_'));
}

describe('dashboards (spec 015)', () => {
  it('AC-015-32: the five dashboards exist with their UIDs and query only known metrics', () => {
    const uids = dashboards.map((dashboard) => dashboard.json.uid);
    for (const uid of [
      'kritzel-overview',
      'kritzel-game',
      'kritzel-websocket',
      'kritzel-runtime',
      'kritzel-security',
    ]) {
      expect(uids).toContain(uid);
    }

    const known = knownMetrics();
    const selfMetric = /^(otel_sdk_processor_|otelcol_)/;
    const unknown: string[] = [];
    for (const { name, json } of dashboards.filter((entry) => entry.name.startsWith('kritzel-'))) {
      expect(json.tags).toContain('kritzel');
      for (const panel of json.panels) {
        for (const target of panel.targets ?? []) {
          if (target.datasource?.type !== 'prometheus' || !target.expr) continue;
          for (const metric of metricsIn(target.expr)) {
            if (!known.has(metric) && !selfMetric.test(metric)) {
              unknown.push(`${name} / ${panel.title}: ${metric}`);
            }
          }
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it('AC-015-32: the committed dashboards are what the generator produces', () => {
    execFileSync('node', ['scripts/dashboards.mjs', '--check'], { cwd: root });
  });

  it('AC-015-43: the Sloth dashboards are provisioned from files and use the Prometheus data source by UID', () => {
    const sloth = dashboards.filter((entry) => entry.name.startsWith('sloth-'));
    expect(sloth.map((entry) => entry.json.uid).sort()).toEqual([
      'high-level-sloth-slos',
      'slo-detail',
    ]);
    for (const { name } of sloth) {
      const text = read(`${OBS}/grafana/dashboards/${name}`);
      expect(text).not.toContain('DS_PROMETHEUS');
      expect(text).not.toContain('__inputs');
      expect(text).toContain('"uid": "prometheus"');
    }
    expect(read('NOTICE.md')).toContain('grafana.com dashboard 14348');
    expect(read('NOTICE.md')).toContain('grafana.com dashboard 14643');
  });
});

describe('rules (spec 015)', () => {
  it('AC-015-36: alert and recording rules are valid and their unit tests pass', () => {
    const check = promtool(
      'check',
      'rules',
      `${OBS}/prometheus/rules/kritzel-alerts.yaml`,
      `${OBS}/prometheus/rules/sloth-kritzel.yaml`,
    );
    expect(check.output).not.toContain('FAILED');
    expect(check.status, check.output).toBe(0);

    const tests = promtool('test', 'rules', `${OBS}/prometheus/tests/alerts.test.yaml`);
    expect(tests.status, tests.output).toBe(0);
    expect(tests.output).toContain('SUCCESS');
  }, 120_000);

  it('AC-015-36: every alert has an owner, a severity, a summary and a runbook link', () => {
    const alerts: Record<string, unknown>[] = [];
    for (const file of ['kritzel-alerts.yaml', 'sloth-kritzel.yaml']) {
      const parsed = parse(read(`${OBS}/prometheus/rules/${file}`)) as {
        groups: { rules: Record<string, unknown>[] }[];
      };
      alerts.push(
        ...parsed.groups.flatMap((group) => group.rules).filter((rule) => 'alert' in rule),
      );
    }
    expect(alerts.length).toBeGreaterThanOrEqual(14);
    for (const alert of alerts) {
      const labels = alert.labels as Record<string, string>;
      const annotations = alert.annotations as Record<string, string>;
      expect(labels.severity, String(alert.alert)).toMatch(/^(info|warning|critical)$/);
      expect(labels.owner, String(alert.alert)).toBe('operator');
      expect(annotations.summary, String(alert.alert)).toBeTruthy();
      expect(annotations.runbook_url, String(alert.alert)).toBe(
        `https://github.com/Mistral-valaise/open-skribbl/blob/main/docs/RUNBOOK.md#${String(alert.alert).toLowerCase()}`,
      );
    }
  });

  it('AC-015-42: the SLO rules are exactly what Sloth generates from the specification', () => {
    const result = spawnSync('node', ['scripts/slo.mjs', '--check'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  }, 180_000);

  it('AC-015-42: the specification declares the four objectives with their targets', () => {
    const spec = parse(read(`${OBS}/slo/kritzel.slo.yaml`)) as {
      service: string;
      slos: { name: string; objective: number }[];
    };
    expect(spec.service).toBe('kritzel');
    expect(Object.fromEntries(spec.slos.map((slo) => [slo.name, slo.objective]))).toEqual({
      'join-success': 99.9,
      'ws-processing-latency': 99,
      'reconnect-latency': 99,
      'api-availability': 99.9,
    });
  });
});

describe('collector and Compose files (spec 015)', () => {
  const collector = read(`${OBS}/collector/config.yaml`);
  const keys = (pattern: RegExp) =>
    [...(pattern.exec(collector)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((match) => match[1]!);

  it('AC-015-37: the collector repeats the application allowlists', () => {
    const spanKeys = keys(/keep_keys\(span\.attributes, \[([^\]]*)\]\)/);
    const expected = [
      ...Object.keys(LABEL_VALUES),
      'http.response.status_code',
      'error.type',
    ].filter(
      // Runtime metric labels never appear on spans.
      (name) => name !== 'cpu.mode' && name !== 'v8js.gc.type',
    );
    expect(spanKeys.sort()).toEqual(expected.sort());
    expect(keys(/keep_keys\(log\.attributes, \[([^\]]*)\]\)/).sort()).toEqual(
      [...LOG_ATTRIBUTE_ALLOWLIST].sort(),
    );
    const config = parse(collector) as {
      service: { pipelines: Record<string, { processors: string[] }> };
    };
    for (const pipeline of ['traces', 'logs']) {
      const processors = config.service.pipelines[pipeline]!.processors;
      expect(processors[0]).toBe('memory_limiter');
      expect(processors).toContain('transform/allowlist');
    }
  });

  it('AC-015-38: docker-compose.yml defines only the game and sets no telemetry variable', () => {
    const text = read('docker-compose.yml');
    const compose = parse(text) as { services: Record<string, unknown> };
    expect(Object.keys(compose.services)).toEqual(['kritzel']);
    expect(text).not.toMatch(/TELEMETRY|OTEL_|RUM_ENABLED/);
  });

  it('the overlay pins every image by digest and publishes only Grafana, on localhost', () => {
    const overlay = parse(read('docker-compose.observability.yml')) as {
      services: Record<string, { image?: string; ports?: string[] }>;
    };
    for (const [name, service] of Object.entries(overlay.services)) {
      if (service.image) expect(service.image, name).toMatch(/@sha256:[0-9a-f]{64}$/);
      if (name !== 'grafana') expect(service.ports, name).toBeUndefined();
    }
    expect(overlay.services.grafana!.ports).toEqual(['127.0.0.1:3001:3000']);
  });
});

describe('documentation (spec 015)', () => {
  const guide = read('docs/OBSERVABILITY.md');

  it('AC-015-41: the guide lists every metric and span of the contract', async () => {
    const { SPANS } = await import('../apps/server/src/telemetry/contract.js');
    const missing: string[] = [];
    for (const metric of Object.values(METRICS)) {
      for (const name of [metric.name, metric.prometheus]) {
        if (!guide.includes(`\`${name}\``)) missing.push(name);
      }
    }
    for (const span of Object.values(SPANS)) {
      if (!guide.includes(`\`${span}\``)) missing.push(span);
    }
    expect(missing).toEqual([]);
    expect(guide).toContain('`ws <type>`');
    expect(guide).toContain('`<METHOD> <route>`');
  });

  it('AC-015-41: the runbook has a section for every alert', () => {
    const runbook = read('docs/RUNBOOK.md');
    const alerts = new Set<string>();
    for (const file of ['kritzel-alerts.yaml', 'sloth-kritzel.yaml']) {
      const parsed = parse(read(`${OBS}/prometheus/rules/${file}`)) as {
        groups: { rules: { alert?: string }[] }[];
      };
      for (const rule of parsed.groups.flatMap((group) => group.rules)) {
        if (rule.alert) alerts.add(rule.alert);
      }
    }
    expect(alerts.size).toBe(11);
    for (const alert of alerts) expect(runbook, alert).toContain(`\n## ${alert}\n`);
  });

  it('AC-015-40: the measured overhead is recorded and within the budget', () => {
    const section = guide.slice(guide.indexOf('\n## Overhead'));
    const row = (state: string) =>
      new RegExp(
        `\\| ${state}\\s*\\|[^|]*\\|[^|]*/[^|]*/ (\\d+) ms /[^|]*\\| 0\\s*\\| ([\\d.]+) MiB`,
      ).exec(section);
    const off = row('off');
    const on = row('on');
    expect(off, 'telemetry off row').not.toBeNull();
    expect(on, 'telemetry on row').not.toBeNull();
    // Spec 015, "Overhead budget": at most 5 ms at the 99th percentile and 96 MB.
    expect(Number(on![1]) - Number(off![1])).toBeLessThanOrEqual(5);
    expect(Number(on![2]) - Number(off![2])).toBeLessThanOrEqual(96);
    expect(section).toContain('1 CPU and 512 MB');
  });
});
