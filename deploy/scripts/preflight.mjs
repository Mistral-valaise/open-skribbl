#!/usr/bin/env node
// Preflight for a deployment to an existing namespace (spec 016). It changes
// nothing. It stops with a message that says what to do when the login, the
// namespace, a permission or the quota would make the deployment fail.
//
// Usage: node deploy/scripts/preflight.mjs --namespace <ns> --manifests <rendered.yaml>
//                                           [--release kritzel] [--obs-release kritzel-obs]
//
// `oc` must be logged in (KUBECONFIG). The manifests are the output of
// `helm template` (one or both charts concatenated); their requests and limits
// are compared with what the namespace's quotas still allow. Nothing printed
// here is a secret.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseAllDocuments } from 'yaml';

const manifestsPaths = [];
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index].replace(/^--/, '');
  const value = process.argv[index + 1] ?? '';
  if (key === 'manifests') manifestsPaths.push(value);
  else args.set(key, value);
}
const namespace = args.get('namespace') ?? process.env.OPENSHIFT_NAMESPACE ?? '';
const release = args.get('release') ?? 'kritzel';
const obsRelease = args.get('obs-release') ?? `${release}-obs`;

/** What the charts create; each needs create, patch and delete. */
const REQUIRED = [
  'deployments.apps',
  'statefulsets.apps',
  'services',
  'serviceaccounts',
  'configmaps',
  'secrets',
  'networkpolicies.networking.k8s.io',
  'routes.route.openshift.io',
];

const WORKLOAD_KINDS = new Set(['Deployment', 'StatefulSet']);

const lines = [];
const say = (ok, text) => {
  lines.push(`${ok ? 'ok  ' : 'FAIL'}  ${text}`);
  console.log(lines.at(-1));
};
function stop(problem, advice) {
  console.error(`\nPreflight failed: ${problem}`);
  console.error(`What to do: ${advice}`);
  process.exit(1);
}

function oc(...command) {
  const result = spawnSync('oc', command, { encoding: 'utf8' });
  if (result.error) {
    stop('the oc command line tool was not found', 'Install oc and put it on the PATH.');
  }
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}

/** Kubernetes quantities as numbers: CPU in cores, everything else in bytes. */
function quantity(value) {
  if (value === undefined || value === null || value === '') return 0;
  const text = String(value);
  const match = /^([0-9.]+)([a-zA-Z]*)$/.exec(text);
  if (!match) return Number.NaN;
  const number = Number(match[1]);
  const units = {
    '': 1,
    m: 1e-3,
    k: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
  };
  return match[2] in units ? number * units[match[2]] : Number.NaN;
}

const TRACKED = [
  'requests.cpu',
  'requests.memory',
  'requests.ephemeral-storage',
  'limits.cpu',
  'limits.memory',
  'limits.ephemeral-storage',
];

/** Adds up what pod templates (or pods) ask for, per quota key. */
function demand(podSpecs) {
  const total = Object.fromEntries(TRACKED.map((key) => [key, 0]));
  for (const { spec, replicas } of podSpecs) {
    for (const container of [...(spec.containers ?? []), ...(spec.initContainers ?? [])]) {
      for (const kind of ['requests', 'limits']) {
        for (const resource of ['cpu', 'memory', 'ephemeral-storage']) {
          total[`${kind}.${resource}`] +=
            replicas * quantity(container.resources?.[kind]?.[resource]);
        }
      }
    }
  }
  return total;
}

const human = (key, value) =>
  key.endsWith('cpu') ? `${Math.round(value * 1000)}m` : `${Math.round(value / 1024 ** 2)}Mi`;

// ── 1. Login ─────────────────────────────────────────────────────────────
if (!namespace) stop('no namespace was given', 'Pass --namespace or set OPENSHIFT_NAMESPACE.');
const who = oc('whoami');
if (!who.ok) {
  if (/unauthorized|token|must be logged in|provide credentials/i.test(who.err)) {
    stop(
      'the cluster rejected the token (expired, revoked, or for another cluster)',
      'Copy a new login token from the OpenShift console ("Copy login command") and store it as the secret OPENSHIFT_TOKEN. Sandbox tokens expire after about a day.',
    );
  }
  stop(
    'the cluster could not be reached',
    'Check OPENSHIFT_SERVER (the API URL, https://api…:6443) and that the cluster is up.',
  );
}
say(true, 'logged in to the cluster');

// ── 2. Namespace ─────────────────────────────────────────────────────────
const project = oc('get', 'namespace', namespace, '-o', 'jsonpath={.metadata.name}');
if (!project.ok || project.out !== namespace) {
  stop(
    `the namespace "${namespace}" does not exist or this token cannot see it`,
    'Check OPENSHIFT_NAMESPACE. The deployment never creates a namespace; on the Developer Sandbox it is <user>-dev.',
  );
}
say(true, `namespace ${namespace} exists`);

// ── 3. Permissions ───────────────────────────────────────────────────────
const missing = [];
for (const resource of REQUIRED) {
  for (const verb of ['create', 'patch', 'delete']) {
    const answer = oc('auth', 'can-i', verb, resource, '--namespace', namespace);
    if (answer.out.split('\n').at(-1) !== 'yes') missing.push(`${verb} ${resource}`);
  }
}
if (missing.length > 0) {
  stop(
    `the token may not ${missing.join(', ')} in ${namespace}`,
    'Use a token of a user or service account with the edit role in the namespace. No cluster-wide right is needed.',
  );
}
say(true, `may manage ${REQUIRED.length} kinds of objects in ${namespace}`);

// ── 4. Quota and limits ──────────────────────────────────────────────────
if (manifestsPaths.length > 0) {
  const manifests = manifestsPaths
    .flatMap((file) => parseAllDocuments(readFileSync(file, 'utf8')))
    .map((document) => document.toJS())
    .filter(Boolean);
  const workloads = manifests.filter((manifest) => WORKLOAD_KINDS.has(manifest.kind));
  const wanted = demand(
    workloads.map((manifest) => ({
      spec: manifest.spec.template.spec,
      replicas: manifest.spec.replicas ?? 1,
    })),
  );

  // What these releases already use is released by the upgrade, so it is not counted twice.
  const running = oc(
    'get',
    'pods',
    '--namespace',
    namespace,
    '--selector',
    `app.kubernetes.io/instance in (${release},${obsRelease})`,
    '--output',
    'json',
  );
  const own = demand(
    running.ok
      ? (JSON.parse(running.out).items ?? [])
          .filter((pod) => pod.status?.phase === 'Running' || pod.status?.phase === 'Pending')
          .map((pod) => ({ spec: pod.spec, replicas: 1 }))
      : [],
  );

  const quotas = oc('get', 'resourcequota', '--namespace', namespace, '--output', 'json');
  const short = [];
  for (const quota of quotas.ok ? (JSON.parse(quotas.out).items ?? []) : []) {
    // Quotas for pods that end by themselves (builds, jobs) do not apply to Deployments.
    if ((quota.spec?.scopes ?? []).includes('Terminating')) continue;
    for (const key of TRACKED) {
      const hard = quota.status?.hard?.[key];
      if (hard === undefined) continue;
      const free = quantity(hard) - quantity(quota.status?.used?.[key]) + own[key];
      if (wanted[key] > free + 1e-9) {
        short.push(
          `${key}: needs ${human(key, wanted[key])}, ${human(key, Math.max(0, free))} free of ${hard} (quota ${quota.metadata.name})`,
        );
      }
    }
  }
  if (short.length > 0) {
    stop(
      `the namespace quota cannot hold the deployment:\n  - ${short.join('\n  - ')}`,
      'Remove other workloads from the namespace, or lower the requests and limits in the chart values. Nothing was changed.',
    );
  }
  say(
    true,
    `quota holds the deployment (requests ${human('cpu', wanted['requests.cpu'])} CPU, ${human('memory', wanted['requests.memory'])} memory; limits ${human('cpu', wanted['limits.cpu'])} CPU, ${human('memory', wanted['limits.memory'])} memory, ${human('storage', wanted['limits.ephemeral-storage'])} ephemeral storage)`,
  );

  const ranges = oc('get', 'limitrange', '--namespace', namespace, '--output', 'json');
  const outside = [];
  for (const range of ranges.ok ? (JSON.parse(ranges.out).items ?? []) : []) {
    for (const limit of range.spec?.limits ?? []) {
      if (limit.type !== 'Container') continue;
      for (const manifest of workloads) {
        for (const container of manifest.spec.template.spec.containers) {
          for (const resource of ['cpu', 'memory']) {
            const value = quantity(container.resources?.limits?.[resource]);
            if (limit.max?.[resource] && value > quantity(limit.max[resource])) {
              outside.push(
                `${manifest.metadata.name}: ${resource} limit above the maximum ${limit.max[resource]}`,
              );
            }
            const request = quantity(container.resources?.requests?.[resource]);
            if (limit.min?.[resource] && request < quantity(limit.min[resource])) {
              outside.push(
                `${manifest.metadata.name}: ${resource} request below the minimum ${limit.min[resource]}`,
              );
            }
          }
        }
      }
    }
  }
  if (outside.length > 0) {
    stop(
      `the namespace's LimitRange refuses the deployment:\n  - ${outside.join('\n  - ')}`,
      'Adjust the requests and limits in the chart values to fit the LimitRange.',
    );
  }
  say(true, 'requests and limits fit the LimitRange');
}

console.log('\nPreflight passed. Nothing was changed.');
