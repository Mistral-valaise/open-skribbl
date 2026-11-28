import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse, parseAllDocuments } from 'yaml';

/**
 * Policy tests for both Helm charts (spec 016):
 * - `deploy/helm/kritzel`: standalone Kritzel application chart
 * - `deploy/helm/kritzel-observability`: observability umbrella chart using
 *   official upstream OCI charts
 *
 * They render both charts with `helm template` and verify security, networking,
 * resources, and Compose config parity; nothing touches a cluster.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const CHART = 'deploy/helm/kritzel';
const OBS_CHART = 'deploy/helm/kritzel-observability';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const DEMO = ['-f', `${CHART}/values-demo.yaml`, '--set', `image.digest=${DIGEST}`];
const OBS_BASE = ['--set-string', 'grafana.admin.existingSecret=kritzel-grafana'];
const OBS_DEMO = ['-f', `${OBS_CHART}/values-demo.yaml`, ...OBS_BASE];
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
  args?: string[];
  env?: { name: string; value?: string; valueFrom?: unknown }[];
  securityContext?: Record<string, unknown>;
  resources?: Record<'requests' | 'limits', Record<string, string>>;
  readinessProbe?: { httpGet?: { path: string } };
  livenessProbe?: { httpGet?: { path: string } };
  startupProbe?: { httpGet?: { path: string } };
  volumeMounts?: { name: string; mountPath: string; readOnly?: boolean; subPath?: string }[];
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

function render(release: string, chart: string, ...args: string[]): Manifest[] {
  const result = helm('template', release, chart, '--namespace', 'demo', ...args);
  expect(result.status, result.output).toBe(0);
  return parseAllDocuments(result.output)
    .map((document) => document.toJS() as Manifest | null)
    .filter((manifest): manifest is Manifest => manifest !== null);
}

const app = render('kritzel', CHART);
const demo = render('kritzel', CHART, ...DEMO);
const obsDemo = render('kritzel-obs', OBS_CHART, ...OBS_DEMO);

const of = (manifests: Manifest[], kind: string) =>
  manifests.filter((manifest) => manifest.kind === kind);
const workloads = (manifests: Manifest[]) =>
  manifests.filter((manifest) => manifest.kind === 'Deployment' || manifest.kind === 'StatefulSet');
const named = (manifests: Manifest[], kind: string, name: string) =>
  of(manifests, kind).find((manifest) => manifest.metadata.name === name)!;
const pod = (workload: Manifest) => workload.spec!.template!.spec;
const env = (container: Container) =>
  Object.fromEntries((container.env ?? []).map((entry) => [entry.name, entry.value]));

const OBS_COMPONENTS = [
  'kritzel-obs-opentelemetry-collector',
  'kritzel-obs-prometheus-server',
  'kritzel-obs-loki',
  'kritzel-obs-tempo',
  'kritzel-obs-grafana',
];

describe('chart profiles (spec 016)', () => {
  it('AC-016-01: helm lint passes for both charts in default and demo profiles', () => {
    for (const [chart, argsList] of [
      [CHART, [[], DEMO]],
      [OBS_CHART, [OBS_BASE, OBS_DEMO]],
    ] as const) {
      for (const args of argsList) {
        const lint = helm('lint', chart, '--strict', ...args);
        expect(lint.status, lint.output).toBe(0);
        expect(lint.output).toContain('0 chart(s) failed');
      }
    }
  });

  it('AC-016-02: the default values of kritzel install the game alone, without telemetry', () => {
    expect(app.map((manifest) => `${manifest.kind}/${manifest.metadata.name}`).sort()).toEqual([
      'Deployment/kritzel',
      'NetworkPolicy/kritzel',
      'Service/kritzel',
      'ServiceAccount/kritzel',
    ]);
    const variables = env(pod(named(app, 'Deployment', 'kritzel')).containers[0]!);
    expect(Object.keys(variables).sort()).toEqual([
      'LOG_LEVEL',
      'MAX_ROOMS',
      'PORT',
      'TRUST_PROXY',
    ]);
    expect(JSON.stringify(app)).not.toMatch(/TELEMETRY|OTEL_|RUM_ENABLED/);
  });

  it('AC-016-03: the demo profiles wire Kritzel to the official observability stack and add traffic', () => {
    expect(
      of(demo, 'Deployment')
        .map((manifest) => manifest.metadata.name)
        .sort(),
    ).toEqual(['kritzel', 'kritzel-traffic']);
    for (const deployment of of(demo, 'Deployment')) expect(deployment.spec!.replicas).toBe(1);
    const variables = env(pod(named(demo, 'Deployment', 'kritzel')).containers[0]!);
    expect(variables.TELEMETRY_ENABLED).toBe('true');
    expect(variables.OTEL_EXPORTER_OTLP_ENDPOINT).toBe(
      'http://kritzel-obs-opentelemetry-collector:4318',
    );
    expect(variables.OTEL_RESOURCE_ATTRIBUTES).toBe('deployment.environment.name=demo');
    expect(variables.RUM_ENABLED).toBe('true');
    expect(env(pod(named(demo, 'Deployment', 'kritzel-traffic')).containers[0]!).TRAFFIC_URL).toBe(
      'http://kritzel:3000',
    );

    expect(
      workloads(obsDemo)
        .map((manifest) => manifest.metadata.name)
        .sort(),
    ).toEqual([...OBS_COMPONENTS].sort());
    for (const workload of workloads(obsDemo)) expect(workload.spec!.replicas).toBe(1);
  });

  it('AC-016-03: an external collector can be used with the standalone game chart', () => {
    const external = render(
      'kritzel',
      CHART,
      '--set',
      'telemetry.otlpEndpoint=http://otel.example:4318',
    );
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
    for (const manifests of [app, demo]) {
      const game = named(manifests, 'Deployment', 'kritzel');
      expect(game.spec!.replicas).toBe(1);
      expect(game.spec!.strategy).toEqual({ type: 'Recreate' });
    }
  });

  it('AC-016-16: room limit, sampler and retention of every backend come from values', () => {
    const tunedGame = render(
      'kritzel',
      CHART,
      ...DEMO,
      '--set',
      'game.maxRooms=7',
      '--set',
      'telemetry.sampler=traceidratio',
      '--set-string',
      'telemetry.samplerArg=0.25',
    );
    const game = env(pod(named(tunedGame, 'Deployment', 'kritzel')).containers[0]!);
    expect(game.MAX_ROOMS).toBe('7');
    expect(game.OTEL_TRACES_SAMPLER).toBe('traceidratio');
    expect(game.OTEL_TRACES_SAMPLER_ARG).toBe('0.25');

    const tunedObs = render(
      'kritzel-obs',
      OBS_CHART,
      ...OBS_DEMO,
      '--set',
      'prometheus.server.retention=6h',
      '--set',
      'loki.singleBinary.extraEnv[0].name=LOKI_RETENTION',
      '--set',
      'loki.singleBinary.extraEnv[0].value=7h',
      '--set',
      'tempo.tempo.extraEnv[0].name=TEMPO_RETENTION',
      '--set',
      'tempo.tempo.extraEnv[0].value=8h',
    );
    const prometheus = pod(named(tunedObs, 'Deployment', 'kritzel-obs-prometheus-server'))
      .containers[0]!;
    expect(prometheus.args).toContain('--storage.tsdb.retention.time=6h');
    expect(
      env(pod(named(tunedObs, 'StatefulSet', 'kritzel-obs-loki')).containers[0]!).LOKI_RETENTION,
    ).toBe('7h');
    expect(
      env(pod(named(tunedObs, 'StatefulSet', 'kritzel-obs-tempo')).containers[0]!).TEMPO_RETENTION,
    ).toBe('8h');
  });
});

describe('chart security (spec 016)', () => {
  it('AC-016-05: every container runs under the restricted profile and no pod asks for more', () => {
    for (const [profile, manifests] of Object.entries({ app, demo, obsDemo })) {
      for (const workload of workloads(manifests)) {
        const spec = pod(workload);
        const where = `${profile}/${workload.metadata.name}`;
        expect(spec.securityContext, where).toEqual({
          runAsNonRoot: true,
          seccompProfile: { type: 'RuntimeDefault' },
        });
        expect(spec.securityContext?.runAsUser, where).toBeUndefined();
        expect(spec.securityContext?.runAsGroup, where).toBeUndefined();
        expect(spec.securityContext?.fsGroup, where).toBeUndefined();
        for (const key of ['hostNetwork', 'hostPID', 'hostIPC'])
          expect(Boolean(spec[key]), where).toBe(false);
        expect(spec.initContainers, where).toBeUndefined();
        for (const volume of spec.volumes ?? []) expect(volume.hostPath, where).toBeUndefined();
        for (const container of spec.containers) {
          expect(container.securityContext, `${where}/${container.name}`).toMatchObject({
            runAsNonRoot: true,
            allowPrivilegeEscalation: false,
            readOnlyRootFilesystem: true,
            capabilities: { drop: ['ALL'] },
          });
          expect(
            container.securityContext?.runAsUser,
            `${where}/${container.name}`,
          ).toBeUndefined();
          expect(
            container.securityContext?.runAsGroup,
            `${where}/${container.name}`,
          ).toBeUndefined();
          expect(Boolean(container.securityContext?.privileged), `${where}/${container.name}`).toBe(
            false,
          );
        }
      }
    }
    const rendered = JSON.stringify([...demo, ...obsDemo]);
    for (const forbidden of ['runAsUser', 'runAsGroup', 'fsGroup', 'anyuid']) {
      expect(rendered).not.toContain(forbidden);
    }
  });

  it('AC-016-06: every container has requests and limits, and data emptyDirs set a size limit', () => {
    for (const [profile, manifests] of Object.entries({ app, demo, obsDemo })) {
      for (const workload of workloads(manifests)) {
        const spec = pod(workload);
        for (const container of spec.containers) {
          for (const kind of ['requests', 'limits'] as const) {
            for (const resource of ['cpu', 'memory', 'ephemeral-storage']) {
              expect(
                container.resources?.[kind]?.[resource],
                `${profile}/${workload.metadata.name} ${kind}.${resource}`,
              ).toBeTruthy();
            }
          }
        }
      }
    }
    for (const [name, kind, volName] of [
      ['kritzel-obs-prometheus-server', 'Deployment', 'storage-volume'],
      ['kritzel-obs-loki', 'StatefulSet', 'storage'],
      ['kritzel-obs-tempo', 'StatefulSet', 'tempo-data'],
    ] as const) {
      const volume = pod(named(obsDemo, kind, name)).volumes?.find((v) => v.name === volName);
      expect(volume?.emptyDir?.sizeLimit, `${name}/${volName}`).toBe('2Gi');
    }
  });

  it('AC-016-06: the initial resources are the documented ones', () => {
    const limits = Object.fromEntries(
      [...workloads(demo), ...workloads(obsDemo)].map((workload) => {
        const resources = pod(workload).containers[0]!.resources!;
        return [
          workload.metadata.name,
          `${resources.requests.cpu} ${resources.limits.cpu} ${resources.requests.memory} ${resources.limits.memory} ${resources.limits['ephemeral-storage']}`,
        ];
      }),
    );
    expect(limits).toEqual({
      kritzel: '100m 1000m 128Mi 512Mi 128Mi',
      'kritzel-traffic': '25m 200m 48Mi 128Mi 64Mi',
      'kritzel-obs-opentelemetry-collector': '100m 500m 128Mi 256Mi 128Mi',
      'kritzel-obs-prometheus-server': '200m 1000m 256Mi 768Mi 2Gi',
      'kritzel-obs-loki': '200m 1000m 256Mi 768Mi 2Gi',
      'kritzel-obs-tempo': '200m 1000m 256Mi 768Mi 2Gi',
      'kritzel-obs-grafana': '100m 500m 256Mi 768Mi 512Mi',
    });
  });

  it('AC-016-07: only namespaced kinds the charts are allowed to create', () => {
    const appAllowed = ['Deployment', 'NetworkPolicy', 'Route', 'Service', 'ServiceAccount'];
    for (const manifests of [app, demo]) {
      for (const manifest of manifests) {
        expect(appAllowed, manifest.kind).toContain(manifest.kind);
        expect(manifest.metadata.namespace, manifest.metadata.name).toBeUndefined();
      }
    }
    const obsAllowed = [
      'ConfigMap',
      'Deployment',
      'NetworkPolicy',
      'PersistentVolumeClaim',
      'Route',
      'Service',
      'ServiceAccount',
      'StatefulSet',
    ];
    for (const manifest of obsDemo) {
      expect(obsAllowed, manifest.kind).toContain(manifest.kind);
    }
  });

  it('AC-016-08: every pod has a service account of its own and does not mount its token', () => {
    for (const manifests of [demo, obsDemo]) {
      const list = workloads(manifests);
      const accounts = list.map((workload) => pod(workload).serviceAccountName);
      expect(new Set(accounts).size).toBe(list.length);
      for (const workload of list) {
        expect(pod(workload).automountServiceAccountToken, workload.metadata.name).toBe(false);
        expect(pod(workload).serviceAccountName).toBe(workload.metadata.name);
      }
    }
  });

  it('AC-016-09: observability images are pinned by digest, and the game demo insists on one', () => {
    const overlay = parse(read('docker-compose.observability.yml')) as {
      services: Record<string, { image?: string }>;
    };
    const compose: [string, 'Deployment' | 'StatefulSet', string][] = [
      [
        'kritzel-obs-opentelemetry-collector',
        'Deployment',
        overlay.services['otel-collector']!.image!,
      ],
      ['kritzel-obs-prometheus-server', 'Deployment', overlay.services.prometheus!.image!],
      ['kritzel-obs-loki', 'StatefulSet', overlay.services.loki!.image!],
      ['kritzel-obs-tempo', 'StatefulSet', overlay.services.tempo!.image!],
      ['kritzel-obs-grafana', 'Deployment', overlay.services.grafana!.image!],
    ];
    for (const [name, kind, image] of compose) {
      const used = pod(named(obsDemo, kind, name)).containers[0]!.image;
      expect(used, name).toMatch(/@sha256:[0-9a-f]{64}$/);
      const digest = /@sha256:[0-9a-f]{64}$/.exec(image)![0];
      expect(used, name).toContain(digest);
    }
    expect(pod(named(demo, 'Deployment', 'kritzel')).containers[0]!.image).toBe(
      `ghcr.io/mistral-valaise/open-skribbl@${DIGEST}`,
    );
    const noDigest = helm('template', 'kritzel', CHART, '-f', `${CHART}/values-demo.yaml`);
    expect(noDigest.status).not.toBe(0);
    expect(noDigest.output).toContain('image.digest is required');
    const untagged = helm(
      'template',
      'kritzel-obs',
      OBS_CHART,
      ...OBS_DEMO,
      '--set',
      'loki.loki.image.digest=',
    );
    expect(untagged.status).not.toBe(0);
  });

  it('AC-016-11: Grafana takes its password from an existing Secret and the charts hold none', () => {
    const grafana = pod(named(obsDemo, 'Deployment', 'kritzel-obs-grafana')).containers[0]!;
    const password = grafana.env!.find((entry) => entry.name === 'GF_SECURITY_ADMIN_PASSWORD')!;
    expect(password.value).toBeUndefined();
    expect(password.valueFrom).toEqual({
      secretKeyRef: { name: 'kritzel-grafana', key: 'admin-password' },
    });
    expect(env(grafana).GF_AUTH_ANONYMOUS_ENABLED).toBe('false');
    expect(env(grafana).GF_USERS_ALLOW_SIGN_UP).toBe('false');
    expect(of(demo, 'Secret')).toEqual([]);
    expect(of(obsDemo, 'Secret')).toEqual([]);

    const missing = helm(
      'template',
      'kritzel-obs',
      OBS_CHART,
      '-f',
      `${OBS_CHART}/values-demo.yaml`,
    );
    expect(missing.status).not.toBe(0);
    expect(missing.output).toContain('grafana.admin.existingSecret is required');
    const inline = helm(
      'template',
      'kritzel-obs',
      OBS_CHART,
      ...OBS_DEMO,
      '--set',
      'grafana.adminPassword=hunter2',
    );
    expect(inline.status).not.toBe(0);
    for (const file of [
      `${CHART}/values.yaml`,
      `${CHART}/values-demo.yaml`,
      `${OBS_CHART}/values.yaml`,
      `${OBS_CHART}/values-demo.yaml`,
    ]) {
      expect(read(file)).not.toMatch(/password:\s*\S/i);
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
    const routes = [...of(demo, 'Route'), ...of(obsDemo, 'Route')];
    expect(routes.map((route) => route.metadata.name).sort()).toEqual([
      'kritzel',
      'kritzel-obs-grafana',
    ]);
    for (const route of routes) {
      const spec = route.spec as unknown as RouteSpec;
      expect(spec.tls).toEqual({ termination: 'edge', insecureEdgeTerminationPolicy: 'Redirect' });
      expect(spec.to.name).toBe(route.metadata.name);
    }
    expect(named(demo, 'Route', 'kritzel').metadata.annotations).toEqual({
      'haproxy.router.openshift.io/timeout-tunnel': '1h',
    });
    const internal = render(
      'kritzel-obs',
      OBS_CHART,
      ...OBS_DEMO,
      '--set',
      'grafanaRoute.enabled=false',
    );
    expect(of(internal, 'Route')).toEqual([]);
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
      [...of(demo, 'NetworkPolicy'), ...of(obsDemo, 'NetworkPolicy')].map((policy) => {
        const spec = policy.spec as unknown as { policyTypes: string[]; ingress: Rule[] };
        expect(spec.policyTypes).toEqual(['Ingress']);
        return [
          policy.metadata.name,
          spec.ingress.flatMap((rule) =>
            rule.ports.flatMap(({ port }) =>
              (rule.from ?? [{}]).map((peer) => {
                if (peer.podSelector) {
                  const labels = peer.podSelector.matchLabels;
                  const who =
                    labels['app.kubernetes.io/component'] ?? labels['app.kubernetes.io/name'];
                  return `${who}:${port}`;
                }
                return peer.namespaceSelector ? `router:${port}` : `anyone:${port}`;
              }),
            ),
          ),
        ];
      }),
    );
    expect(allowed).toEqual({
      kritzel: ['router:3000', 'traffic:3000'],
      'kritzel-traffic': [],
      'kritzel-obs-opentelemetry-collector': ['game:4318'],
      'kritzel-obs-prometheus-server': ['opentelemetry-collector:9090', 'grafana:9090'],
      'kritzel-obs-loki': ['opentelemetry-collector:3100', 'grafana:3100'],
      'kritzel-obs-tempo': [
        'opentelemetry-collector:4318',
        'opentelemetry-collector:3200',
        'grafana:3200',
      ],
      'kritzel-obs-grafana': ['opentelemetry-collector:3000', 'router:3000'],
    });
    const open = named(app, 'NetworkPolicy', 'kritzel').spec as unknown as { ingress: Rule[] };
    expect(open.ingress).toEqual([{ ports: [{ port: 3000, protocol: 'TCP' }] }]);
  });

  it('AC-016-13: the stack reads the very files the Compose overlay mounts', () => {
    const files = `${OBS_CHART}/files`;
    const mounted: [string, string, string][] = [
      ['kritzel-obs-collector-config', 'relay', `${files}/collector/config.yaml`],
      ['kritzel-obs-prometheus-config', 'prometheus.yml', `${files}/prometheus/prometheus.yml`],
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
      ['kritzel-obs-loki-config', 'config.yaml', `${files}/loki/loki.yaml`],
      ['kritzel-tempo-config', 'tempo.yaml', `${files}/tempo/tempo.yaml`],
      [
        'kritzel-obs-grafana-provisioning',
        'datasources.yaml',
        `${files}/grafana/provisioning/datasources/datasources.yaml`,
      ],
      [
        'kritzel-obs-grafana-provisioning',
        'dashboards.yaml',
        `${files}/grafana/provisioning/dashboards/dashboards.yaml`,
      ],
    ];
    for (const [configMap, key, path] of mounted) {
      expect(named(obsDemo, 'ConfigMap', configMap).data![key], `${configMap}/${key}`).toBe(
        read(path),
      );
    }
    const dashboards = named(obsDemo, 'ConfigMap', 'kritzel-obs-grafana-dashboards').data!;
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

  it('AC-016-05 AC-016-13: every backend writable storage path maps to a writable emptyDir mount and Compose volume', () => {
    const normalizePath = (value: string) => value.replace(/\/+$/, '') || '/';
    const isInside = (target: string, mount: string) => {
      const normalizedTarget = normalizePath(target);
      const normalizedMount = normalizePath(mount);
      return (
        normalizedTarget === normalizedMount || normalizedTarget.startsWith(`${normalizedMount}/`)
      );
    };
    const expectWritableMount = (
      kind: 'Deployment' | 'StatefulSet',
      name: string,
      targetPath: string,
    ) => {
      const podSpec = pod(named(obsDemo, kind, name));
      const emptyDirs = new Set(
        (podSpec.volumes ?? [])
          .filter((volume) => volume.emptyDir !== undefined)
          .map((volume) => volume.name),
      );
      const container = podSpec.containers[0]!;
      const mounted = (container.volumeMounts ?? []).some(
        (mount) =>
          !mount.readOnly &&
          !mount.subPath &&
          emptyDirs.has(mount.name) &&
          isInside(targetPath, mount.mountPath),
      );
      expect(mounted, `${name} writable emptyDir mount for ${targetPath}`).toBe(true);
    };

    const expandEnv = (value: string, vars: Record<string, string | undefined>) =>
      value.replace(
        /\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g,
        (_, key: string, fallback?: string) => vars[key] || fallback || '',
      );

    const lokiContainer = pod(named(obsDemo, 'StatefulSet', 'kritzel-obs-loki')).containers[0]!;
    expect(lokiContainer.args).toContain('-config.expand-env=true');
    const lokiHelmEnv = env(lokiContainer);
    const lokiConfig = parse(
      named(obsDemo, 'ConfigMap', 'kritzel-obs-loki-config').data!['config.yaml']!,
    ) as {
      common: {
        path_prefix: string;
        storage: { filesystem: { chunks_directory: string; rules_directory: string } };
      };
      compactor: { working_directory: string };
    };
    const lokiRawPaths = [
      lokiConfig.common.path_prefix,
      lokiConfig.common.storage.filesystem.chunks_directory,
      lokiConfig.common.storage.filesystem.rules_directory,
      lokiConfig.compactor.working_directory,
    ];
    for (const rawPath of lokiRawPaths) {
      expectWritableMount('StatefulSet', 'kritzel-obs-loki', expandEnv(rawPath, lokiHelmEnv));
    }

    const tempoConfig = parse(
      named(obsDemo, 'ConfigMap', 'kritzel-tempo-config').data!['tempo.yaml']!,
    ) as {
      storage: { trace: { wal: { path: string }; local: { path: string } } };
    };
    for (const tempoPath of [
      tempoConfig.storage.trace.wal.path,
      tempoConfig.storage.trace.local.path,
    ]) {
      expectWritableMount('StatefulSet', 'kritzel-obs-tempo', tempoPath);
    }

    const prometheus = pod(named(obsDemo, 'Deployment', 'kritzel-obs-prometheus-server'))
      .containers[0]!;
    const tsdbArg = (prometheus.args ?? []).find((arg) => arg.startsWith('--storage.tsdb.path='));
    expect(tsdbArg).toBeDefined();
    expectWritableMount(
      'Deployment',
      'kritzel-obs-prometheus-server',
      tsdbArg!.slice('--storage.tsdb.path='.length),
    );

    const grafanaEnv = env(pod(named(obsDemo, 'Deployment', 'kritzel-obs-grafana')).containers[0]!);
    expect(grafanaEnv.GF_PATHS_DATA).toBeTruthy();
    expect(grafanaEnv.GF_UNIFIED_STORAGE_INDEX_PATH).toBeTruthy();
    expectWritableMount('Deployment', 'kritzel-obs-grafana', grafanaEnv.GF_PATHS_DATA!);
    expectWritableMount(
      'Deployment',
      'kritzel-obs-grafana',
      grafanaEnv.GF_UNIFIED_STORAGE_INDEX_PATH!,
    );

    const overlay = parse(read('docker-compose.observability.yml')) as {
      services: Record<
        string,
        { command?: string[]; environment?: Record<string, string>; volumes?: string[] }
      >;
    };
    expect(overlay.services.loki?.command).toContain('-config.expand-env=true');
    const lokiComposeEnv = overlay.services.loki?.environment ?? {};
    const lokiMount = (overlay.services.loki?.volumes ?? []).find((v) =>
      v.startsWith('loki-data:'),
    );
    expect(lokiMount).toBe(`loki-data:${expandEnv(lokiConfig.common.path_prefix, lokiComposeEnv)}`);
    const lokiTarget = lokiMount!.split(':')[1]!;
    for (const rawPath of lokiRawPaths) {
      expect(isInside(expandEnv(rawPath, lokiComposeEnv), lokiTarget)).toBe(true);
    }
    const tempoMount = (overlay.services.tempo?.volumes ?? []).find((v) =>
      v.startsWith('tempo-data:'),
    );
    expect(tempoMount).toBeDefined();
    const tempoTarget = tempoMount!.split(':')[1]!;
    expect(isInside(tempoConfig.storage.trace.wal.path, tempoTarget)).toBe(true);
    expect(isInside(tempoConfig.storage.trace.local.path, tempoTarget)).toBe(true);
  });

  it('AC-016-14: the game is probed on /healthz only and gets time to say goodbye', () => {
    for (const manifests of [app, demo]) {
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
    for (const workload of workloads(obsDemo)) {
      const container = pod(workload).containers[0]!;
      expect(container.readinessProbe, workload.metadata.name).toBeDefined();
      expect(container.livenessProbe, workload.metadata.name).toBeDefined();
    }
  });

  it('AC-016-15: the demo believes forwarded addresses only from the cluster pod network', () => {
    expect(env(pod(named(demo, 'Deployment', 'kritzel')).containers[0]!).TRUST_PROXY).toBe(
      '10.128.0.0/14',
    );
    expect(env(pod(named(app, 'Deployment', 'kritzel')).containers[0]!).TRUST_PROXY).toBe('false');
  });
});
