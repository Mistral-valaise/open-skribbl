import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse, parseAllDocuments } from 'yaml';

/**
 * Policy tests for the Helm chart (spec 016). They render the chart with
 * `helm template` and look at what would be applied; nothing touches a
 * cluster.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const CHART = 'deploy/helm/kritzel';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const DEMO = [
  '-f',
  `${CHART}/values-demo.yaml`,
  '--set',
  `image.digest=${DIGEST}`,
  '--set',
  'grafana.existingSecret=kritzel-grafana',
];
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8');

function helm(...args: string[]): { status: number | null; output: string } {
  const result = spawnSync('helm', args, { cwd: root, encoding: 'utf8' });
  if (result.error)
    throw new Error(`helm is required for the chart tests: ${result.error.message}`);
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

interface Container {
  name: string;
  image: string;
  env?: { name: string; value?: string; valueFrom?: unknown }[];
  securityContext?: Record<string, unknown>;
  resources?: Record<'requests' | 'limits', Record<string, string>>;
  readinessProbe?: { httpGet?: { path: string } };
  livenessProbe?: { httpGet?: { path: string } };
  startupProbe?: { httpGet?: { path: string } };
  volumeMounts?: { name: string; mountPath: string; subPath?: string }[];
}
interface Manifest {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, unknown> & {
    replicas?: number;
    strategy?: { type: string };
    template?: {
      spec: Record<string, unknown> & {
        serviceAccountName?: string;
        automountServiceAccountToken?: boolean;
        terminationGracePeriodSeconds?: number;
        securityContext?: Record<string, unknown>;
        containers: Container[];
        initContainers?: Container[];
        volumes?: {
          name: string;
          emptyDir?: { sizeLimit?: string };
          hostPath?: unknown;
          configMap?: { name: string };
        }[];
      };
    };
  };
  data?: Record<string, string>;
  automountServiceAccountToken?: boolean;
}

function render(...args: string[]): Manifest[] {
  const result = helm('template', 'kritzel', CHART, '--namespace', 'demo', ...args);
  expect(result.status, result.output).toBe(0);
  return parseAllDocuments(result.output)
    .map((document) => document.toJS() as Manifest | null)
    .filter((manifest): manifest is Manifest => manifest !== null);
}

const app = render();
const demo = render(...DEMO);
const profiles = { app, demo };
const of = (manifests: Manifest[], kind: string) =>
  manifests.filter((manifest) => manifest.kind === kind);
const named = (manifests: Manifest[], kind: string, name: string) =>
  of(manifests, kind).find((manifest) => manifest.metadata.name === name)!;
const pod = (deployment: Manifest) => deployment.spec!.template!.spec;
const env = (container: Container) =>
  Object.fromEntries((container.env ?? []).map((entry) => [entry.name, entry.value]));

const COMPONENTS = [
  'kritzel',
  'kritzel-collector',
  'kritzel-prometheus',
  'kritzel-loki',
  'kritzel-tempo',
  'kritzel-grafana',
  'kritzel-traffic',
];

describe('chart profiles (spec 016)', () => {
  it('AC-016-01: helm lint passes for the default values and the demo profile', () => {
    for (const args of [[], DEMO]) {
      const lint = helm('lint', CHART, '--strict', ...args);
      expect(lint.status, lint.output).toBe(0);
      expect(lint.output).toContain('0 chart(s) failed');
    }
  });

  it('AC-016-02: the default values install the game alone, without telemetry', () => {
    expect(app.map((manifest) => `${manifest.kind}/${manifest.metadata.name}`).sort()).toEqual([
      'Deployment/kritzel',
      'NetworkPolicy/kritzel',
      'Service/kritzel',
      'ServiceAccount/kritzel',
    ]);
    const variables = env(
      pod(app[2]!.kind === 'Deployment' ? app[2]! : named(app, 'Deployment', 'kritzel'))
        .containers[0]!,
    );
    expect(Object.keys(variables).sort()).toEqual([
      'LOG_LEVEL',
      'MAX_ROOMS',
      'PORT',
      'TRUST_PROXY',
    ]);
    expect(JSON.stringify(app)).not.toMatch(/TELEMETRY|OTEL_|RUM_ENABLED/);
  });

  it('AC-016-03: the demo profile adds the stack and the traffic generator, and turns telemetry on', () => {
    expect(
      of(demo, 'Deployment')
        .map((manifest) => manifest.metadata.name)
        .sort(),
    ).toEqual([...COMPONENTS].sort());
    for (const deployment of of(demo, 'Deployment')) expect(deployment.spec!.replicas).toBe(1);
    const variables = env(pod(named(demo, 'Deployment', 'kritzel')).containers[0]!);
    expect(variables.TELEMETRY_ENABLED).toBe('true');
    expect(variables.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://kritzel-collector:4318');
    expect(variables.OTEL_RESOURCE_ATTRIBUTES).toBe('deployment.environment.name=demo');
    expect(variables.RUM_ENABLED).toBe('true');
    expect(env(pod(named(demo, 'Deployment', 'kritzel-traffic')).containers[0]!).TRAFFIC_URL).toBe(
      'http://kritzel:3000',
    );
  });

  it('AC-016-03: an external collector can be used instead of the stack', () => {
    const external = render('--set', 'telemetry.otlpEndpoint=http://otel.example:4318');
    expect(of(external, 'Deployment')).toHaveLength(1);
    const variables = env(pod(named(external, 'Deployment', 'kritzel')).containers[0]!);
    expect(variables.TELEMETRY_ENABLED).toBe('true');
    expect(variables.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://otel.example:4318');
  });

  it('AC-016-04: only one game replica, replaced rather than overlapped', () => {
    for (const replicas of ['0', '2', '3']) {
      const result = helm('template', 'kritzel', CHART, '--set', `replicaCount=${replicas}`);
      expect(result.status).not.toBe(0);
      expect(result.output).toContain('replicaCount');
    }
    for (const manifests of Object.values(profiles)) {
      const game = named(manifests, 'Deployment', 'kritzel');
      expect(game.spec!.replicas).toBe(1);
      expect(game.spec!.strategy).toEqual({ type: 'Recreate' });
    }
  });

  it('AC-016-16: room limit, sampler and retention of every backend come from values', () => {
    const tuned = render(
      ...DEMO,
      '--set',
      'game.maxRooms=7',
      '--set',
      'telemetry.sampler=traceidratio',
      '--set-string',
      'telemetry.samplerArg=0.25',
      '--set',
      'prometheus.retention=6h',
      '--set',
      'loki.retention=7h',
      '--set',
      'tempo.retention=8h',
    );
    const game = env(pod(named(tuned, 'Deployment', 'kritzel')).containers[0]!);
    expect(game.MAX_ROOMS).toBe('7');
    expect(game.OTEL_TRACES_SAMPLER).toBe('traceidratio');
    expect(game.OTEL_TRACES_SAMPLER_ARG).toBe('0.25');
    const prometheus = pod(named(tuned, 'Deployment', 'kritzel-prometheus'))
      .containers[0] as Container & { args: string[] };
    expect(prometheus.args).toContain('--storage.tsdb.retention.time=6h');
    expect(env(pod(named(tuned, 'Deployment', 'kritzel-loki')).containers[0]!).LOKI_RETENTION).toBe(
      '7h',
    );
    expect(
      env(pod(named(tuned, 'Deployment', 'kritzel-tempo')).containers[0]!).TEMPO_RETENTION,
    ).toBe('8h');
  });
});

describe('chart security (spec 016)', () => {
  it('AC-016-05: every container runs under the restricted profile and no pod asks for more', () => {
    for (const [profile, manifests] of Object.entries(profiles)) {
      for (const deployment of of(manifests, 'Deployment')) {
        const spec = pod(deployment);
        const where = `${profile}/${deployment.metadata.name}`;
        expect(spec.securityContext, where).toEqual({
          runAsNonRoot: true,
          seccompProfile: { type: 'RuntimeDefault' },
        });
        for (const key of ['hostNetwork', 'hostPID', 'hostIPC'])
          expect(spec[key], where).toBeUndefined();
        expect(spec.initContainers, where).toBeUndefined();
        for (const volume of spec.volumes ?? []) expect(volume.hostPath, where).toBeUndefined();
        for (const container of spec.containers) {
          expect(container.securityContext, `${where}/${container.name}`).toEqual({
            runAsNonRoot: true,
            allowPrivilegeEscalation: false,
            readOnlyRootFilesystem: true,
            capabilities: { drop: ['ALL'] },
          });
        }
      }
    }
    const rendered = JSON.stringify(demo);
    for (const forbidden of ['runAsUser', 'fsGroup', 'privileged', 'anyuid']) {
      expect(rendered).not.toContain(forbidden);
    }
  });

  it('AC-016-06: every container has requests and limits, every emptyDir a size limit', () => {
    for (const [profile, manifests] of Object.entries(profiles)) {
      for (const deployment of of(manifests, 'Deployment')) {
        const spec = pod(deployment);
        for (const container of spec.containers) {
          for (const kind of ['requests', 'limits'] as const) {
            for (const resource of ['cpu', 'memory', 'ephemeral-storage']) {
              expect(
                container.resources?.[kind]?.[resource],
                `${profile}/${deployment.metadata.name} ${kind}.${resource}`,
              ).toBeTruthy();
            }
          }
        }
        for (const volume of spec.volumes ?? []) {
          if (volume.emptyDir) {
            expect(
              volume.emptyDir.sizeLimit,
              `${deployment.metadata.name}/${volume.name}`,
            ).toBeTruthy();
          }
        }
      }
    }
  });

  it('AC-016-06: the initial resources are the documented ones', () => {
    const limits = Object.fromEntries(
      of(demo, 'Deployment').map((deployment) => {
        const resources = pod(deployment).containers[0]!.resources!;
        return [
          deployment.metadata.name,
          `${resources.requests.cpu} ${resources.limits.cpu} ${resources.requests.memory} ${resources.limits.memory} ${resources.limits['ephemeral-storage']}`,
        ];
      }),
    );
    expect(limits).toEqual({
      kritzel: '100m 1000m 128Mi 512Mi 128Mi',
      'kritzel-collector': '100m 500m 128Mi 256Mi 128Mi',
      'kritzel-prometheus': '200m 1000m 256Mi 768Mi 2Gi',
      'kritzel-loki': '200m 1000m 256Mi 768Mi 2Gi',
      'kritzel-tempo': '200m 1000m 256Mi 768Mi 2Gi',
      'kritzel-grafana': '100m 500m 128Mi 384Mi 512Mi',
      'kritzel-traffic': '25m 200m 48Mi 128Mi 64Mi',
    });
  });

  it('AC-016-07: only namespaced kinds the chart is allowed to create', () => {
    const allowed = [
      'ConfigMap',
      'Deployment',
      'NetworkPolicy',
      'PersistentVolumeClaim',
      'Route',
      'Service',
      'ServiceAccount',
    ];
    const persistent = render(
      ...DEMO,
      '--set',
      'prometheus.storage.persistent=true',
      '--set',
      'loki.storage.persistent=true',
      '--set',
      'tempo.storage.persistent=true',
    );
    for (const manifests of [app, demo, persistent]) {
      for (const manifest of manifests) {
        expect(allowed, manifest.kind).toContain(manifest.kind);
        expect(manifest.metadata.namespace, manifest.metadata.name).toBeUndefined();
      }
    }
    expect(
      of(persistent, 'PersistentVolumeClaim')
        .map((claim) => claim.metadata.name)
        .sort(),
    ).toEqual(['kritzel-loki', 'kritzel-prometheus', 'kritzel-tempo']);
    expect(of(demo, 'PersistentVolumeClaim')).toEqual([]);
  });

  it('AC-016-08: every pod has a service account of its own and does not mount its token', () => {
    const deployments = of(demo, 'Deployment');
    const accounts = deployments.map((deployment) => pod(deployment).serviceAccountName);
    expect(new Set(accounts).size).toBe(deployments.length);
    for (const deployment of deployments) {
      expect(pod(deployment).automountServiceAccountToken, deployment.metadata.name).toBe(false);
      expect(pod(deployment).serviceAccountName).toBe(deployment.metadata.name);
    }
    for (const account of of(demo, 'ServiceAccount')) {
      expect(account.automountServiceAccountToken, account.metadata.name).toBe(false);
    }
  });

  it('AC-016-09: observability images are pinned by digest, and the demo insists on one for the game', () => {
    const overlay = parse(read('docker-compose.observability.yml')) as {
      services: Record<string, { image?: string }>;
    };
    const compose = {
      'kritzel-collector': overlay.services['otel-collector']!.image,
      'kritzel-prometheus': overlay.services.prometheus!.image,
      'kritzel-loki': overlay.services.loki!.image,
      'kritzel-tempo': overlay.services.tempo!.image,
      'kritzel-grafana': overlay.services.grafana!.image,
    };
    for (const [name, image] of Object.entries(compose)) {
      const used = pod(named(demo, 'Deployment', name)).containers[0]!.image;
      expect(used, name).toMatch(/@sha256:[0-9a-f]{64}$/);
      // The same image the Compose stack was verified with.
      expect(used, name).toBe(image);
    }
    expect(pod(named(demo, 'Deployment', 'kritzel')).containers[0]!.image).toBe(
      `ghcr.io/mistral-valaise/open-skribbl@${DIGEST}`,
    );
    const noDigest = helm(
      'template',
      'kritzel',
      CHART,
      '-f',
      `${CHART}/values-demo.yaml`,
      '--set',
      'grafana.existingSecret=x',
    );
    expect(noDigest.status).not.toBe(0);
    expect(noDigest.output).toContain('image.digest is required');
    const untagged = helm(
      'template',
      'kritzel',
      CHART,
      ...DEMO,
      '--set',
      'loki.image=grafana/loki:latest',
    );
    expect(untagged.status).not.toBe(0);
  });

  it('AC-016-11: Grafana takes its password from an existing Secret and the chart holds none', () => {
    const grafana = pod(named(demo, 'Deployment', 'kritzel-grafana')).containers[0]!;
    const password = grafana.env!.find((entry) => entry.name === 'GF_SECURITY_ADMIN_PASSWORD')!;
    expect(password.value).toBeUndefined();
    expect(password.valueFrom).toEqual({
      secretKeyRef: { name: 'kritzel-grafana', key: 'admin-password' },
    });
    expect(env(grafana).GF_AUTH_ANONYMOUS_ENABLED).toBe('false');
    expect(env(grafana).GF_USERS_ALLOW_SIGN_UP).toBe('false');
    expect(of(demo, 'Secret')).toEqual([]);

    const missing = helm(
      'template',
      'kritzel',
      CHART,
      '-f',
      `${CHART}/values-demo.yaml`,
      '--set',
      `image.digest=${DIGEST}`,
    );
    expect(missing.status).not.toBe(0);
    expect(missing.output).toContain('grafana.existingSecret is required');
    const inline = helm(
      'template',
      'kritzel',
      CHART,
      ...DEMO,
      '--set',
      'grafana.adminPassword=hunter2',
    );
    expect(inline.status).not.toBe(0);
    for (const file of ['values.yaml', 'values-demo.yaml']) {
      expect(read(`${CHART}/${file}`)).not.toMatch(/password:\s*\S/i);
    }
  });
});

describe('chart networking (spec 016)', () => {
  interface RouteSpec {
    to: { name: string };
    tls: { termination: string; insecureEdgeTerminationPolicy: string };
  }

  it('AC-016-10: Routes for the game and, when asked, Grafana; none for the backends', () => {
    expect(of(app, 'Route')).toEqual([]);
    const routes = of(demo, 'Route');
    expect(routes.map((route) => route.metadata.name).sort()).toEqual([
      'kritzel',
      'kritzel-grafana',
    ]);
    for (const route of routes) {
      const spec = route.spec as unknown as RouteSpec;
      expect(spec.tls).toEqual({ termination: 'edge', insecureEdgeTerminationPolicy: 'Redirect' });
      expect(spec.to.name).toBe(route.metadata.name);
    }
    expect(named(demo, 'Route', 'kritzel').metadata.annotations).toEqual({
      'haproxy.router.openshift.io/timeout-tunnel': '1h',
    });
    const internal = render(...DEMO, '--set', 'grafana.route.enabled=false');
    expect(of(internal, 'Route').map((route) => route.metadata.name)).toEqual(['kritzel']);
  });

  it('AC-016-12: network policies allow exactly the documented connections', () => {
    interface Rule {
      ports: { port: number }[];
      from?: {
        podSelector?: { matchLabels: Record<string, string> };
        namespaceSelector?: unknown;
      }[];
    }
    const allowed = Object.fromEntries(
      of(demo, 'NetworkPolicy').map((policy) => {
        const spec = policy.spec as unknown as { policyTypes: string[]; ingress: Rule[] };
        expect(spec.policyTypes).toEqual(['Ingress']);
        return [
          policy.metadata.name,
          spec.ingress.flatMap((rule) =>
            rule.ports.flatMap(({ port }) =>
              (rule.from ?? [{}]).map((peer) =>
                peer.podSelector
                  ? `${peer.podSelector.matchLabels['app.kubernetes.io/component']}:${port}`
                  : peer.namespaceSelector
                    ? `router:${port}`
                    : `anyone:${port}`,
              ),
            ),
          ),
        ];
      }),
    );
    expect(allowed).toEqual({
      kritzel: ['router:3000', 'traffic:3000'],
      'kritzel-traffic': [],
      'kritzel-collector': ['game:4318'],
      'kritzel-prometheus': ['collector:9090', 'grafana:9090'],
      'kritzel-loki': ['collector:3100', 'grafana:3100'],
      'kritzel-tempo': ['collector:4318', 'collector:3200', 'grafana:3200'],
      'kritzel-grafana': ['collector:3000', 'router:3000'],
    });
    // Every pod of the release is selected by a policy.
    expect(
      of(demo, 'NetworkPolicy')
        .map((policy) => policy.metadata.name)
        .sort(),
    ).toEqual([...COMPONENTS].sort());
    // Without a known ingress controller the game accepts any source on its port, and nothing else.
    const open = named(app, 'NetworkPolicy', 'kritzel').spec as unknown as { ingress: Rule[] };
    expect(open.ingress).toEqual([{ ports: [{ port: 3000, protocol: 'TCP' }] }]);
  });

  it('AC-016-13: the stack reads the very files the Compose overlay mounts', () => {
    const files = `${CHART}/files`;
    const mounted: [string, string, string][] = [
      ['kritzel-collector', 'config.yaml', `${files}/collector/config.yaml`],
      ['kritzel-prometheus', 'prometheus.yml', `${files}/prometheus/prometheus.yml`],
      [
        'kritzel-prometheus-rules',
        'kritzel-alerts.yaml',
        `${files}/prometheus/rules/kritzel-alerts.yaml`,
      ],
      [
        'kritzel-prometheus-rules',
        'sloth-kritzel.yaml',
        `${files}/prometheus/rules/sloth-kritzel.yaml`,
      ],
      ['kritzel-loki', 'loki.yaml', `${files}/loki/loki.yaml`],
      ['kritzel-tempo', 'tempo.yaml', `${files}/tempo/tempo.yaml`],
      [
        'kritzel-grafana-provisioning',
        'datasources.yaml',
        `${files}/grafana/provisioning/datasources/datasources.yaml`,
      ],
      [
        'kritzel-grafana-provisioning',
        'dashboards.yaml',
        `${files}/grafana/provisioning/dashboards/dashboards.yaml`,
      ],
    ];
    for (const [configMap, key, path] of mounted) {
      expect(named(demo, 'ConfigMap', configMap).data![key], `${configMap}/${key}`).toBe(
        read(path),
      );
    }
    const dashboards = named(demo, 'ConfigMap', 'kritzel-grafana-dashboards').data!;
    expect(Object.keys(dashboards).sort()).toEqual([
      'kritzel-game.json',
      'kritzel-overview.json',
      'kritzel-runtime.json',
      'kritzel-security.json',
      'kritzel-websocket.json',
      'sloth-high-level.json',
      'sloth-slo-detail.json',
    ]);
    for (const [name, content] of Object.entries(dashboards)) {
      expect(content, name).toBe(read(`${files}/grafana/dashboards/${name}`));
    }
    // The overlay mounts from the same directory.
    const overlay = read('docker-compose.observability.yml');
    for (const path of [
      'collector/config.yaml',
      'prometheus/prometheus.yml',
      'prometheus/rules',
      'loki/loki.yaml',
      'tempo/tempo.yaml',
      'grafana/provisioning',
      'grafana/dashboards',
    ]) {
      expect(overlay).toContain(`./${files}/${path}:`);
    }
  });

  it('AC-016-14: the game is probed on /healthz only and gets time to say goodbye', () => {
    for (const manifests of Object.values(profiles)) {
      const spec = pod(named(manifests, 'Deployment', 'kritzel'));
      const container = spec.containers[0]!;
      for (const probe of [
        container.startupProbe,
        container.readinessProbe,
        container.livenessProbe,
      ]) {
        expect(probe?.httpGet?.path).toBe('/healthz');
      }
      expect(spec.terminationGracePeriodSeconds).toBeGreaterThanOrEqual(15);
    }
    for (const deployment of of(demo, 'Deployment').filter(
      (entry) => entry.metadata.name !== 'kritzel-traffic',
    )) {
      const container = pod(deployment).containers[0]!;
      expect(container.readinessProbe, deployment.metadata.name).toBeDefined();
      expect(container.livenessProbe, deployment.metadata.name).toBeDefined();
    }
  });

  it('the demo believes forwarded addresses only from the cluster pod network', () => {
    expect(env(pod(named(demo, 'Deployment', 'kritzel')).containers[0]!).TRUST_PROXY).toBe(
      '10.128.0.0/14',
    );
    expect(env(pod(named(app, 'Deployment', 'kritzel')).containers[0]!).TRUST_PROXY).toBe('false');
  });
});
