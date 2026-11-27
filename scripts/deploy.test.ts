import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * Tests of the deployment tooling (spec 016): the preflight against a
 * scripted `oc`, and the workflow's rules read from its YAML. No cluster is
 * contacted.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8');
const CHART = 'deploy/helm/kritzel';

/** An `oc` that answers from a script, so every refusal can be provoked. */
const fakeBin = mkdtempSync(join(tmpdir(), 'kritzel-fake-oc-'));
writeFileSync(
  join(fakeBin, 'oc'),
  `#!/bin/sh
# Scenario in FAKE_OC: ok | token | unreachable | namespace | permission | quota
case "$1 $2" in
  "whoami ")
    if [ "$FAKE_OC" = token ]; then
      echo "error: You must be logged in to the server (Unauthorized)" >&2; exit 1
    fi
    if [ "$FAKE_OC" = unreachable ]; then
      echo "dial tcp: lookup api.example.invalid: no such host" >&2; exit 1
    fi
    echo demo-user ;;
  "get namespace")
    if [ "$FAKE_OC" = namespace ]; then
      echo 'Error from server (NotFound): namespaces "other" not found' >&2; exit 1
    fi
    echo "$3" ;;
  "auth can-i")
    if [ "$FAKE_OC" = permission ] && [ "$4" = routes.route.openshift.io ]; then echo no; else echo yes; fi ;;
  "get pods")
    echo '{"items":[]}' ;;
  "get resourcequota")
    if [ "$FAKE_OC" = quota ]; then cpu=500m; else cpu=3; fi
    cat <<JSON
{"items":[
 {"metadata":{"name":"compute-build"},"spec":{"scopes":["Terminating"]},
  "status":{"hard":{"requests.cpu":"10m"},"used":{"requests.cpu":"0"}}},
 {"metadata":{"name":"compute-deploy"},"spec":{"scopes":["NotTerminating"]},
  "status":{"hard":{"requests.cpu":"$cpu","requests.memory":"30Gi","limits.cpu":"30","limits.memory":"30Gi"},
            "used":{"requests.cpu":"0","requests.memory":"0","limits.cpu":"0","limits.memory":"0"}}},
 {"metadata":{"name":"storage"},"spec":{},
  "status":{"hard":{"limits.ephemeral-storage":"15Gi","requests.ephemeral-storage":"15Gi"},
            "used":{"limits.ephemeral-storage":"0","requests.ephemeral-storage":"0"}}}
]}
JSON
    ;;
  "get limitrange")
    echo '{"items":[{"spec":{"limits":[{"type":"Container","default":{"cpu":"1","memory":"1000Mi"}}]}}]}' ;;
  *)
    echo "unexpected oc call: $*" >&2; exit 64 ;;
esac
`,
);
chmodSync(join(fakeBin, 'oc'), 0o755);

const manifests = join(fakeBin, 'rendered.yaml');
const rendered = spawnSync(
  'helm',
  [
    'template',
    'kritzel',
    CHART,
    '-f',
    `${CHART}/values-demo.yaml`,
    '--set',
    `image.digest=sha256:${'a'.repeat(64)}`,
    '--set',
    'grafana.existingSecret=kritzel-grafana',
  ],
  { cwd: root, encoding: 'utf8' },
);
writeFileSync(manifests, rendered.stdout);

function preflight(scenario: string, ...extra: string[]) {
  const result = spawnSync(
    'node',
    ['deploy/scripts/preflight.mjs', '--namespace', 'demo-dev', '--manifests', manifests, ...extra],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fakeBin}${delimiter}${process.env.PATH}`, FAKE_OC: scenario },
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('preflight (spec 016)', () => {
  it('AC-016-19: passes when login, namespace, permissions and quota hold', () => {
    expect(rendered.status, rendered.stderr).toBe(0);
    const result = preflight('ok');
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('Preflight passed. Nothing was changed.');
    expect(result.output).toContain('requests 925m CPU, 1328Mi memory');
  });

  it('AC-016-19: a rejected token is named, with how to renew it', () => {
    const result = preflight('token');
    expect(result.status).toBe(1);
    expect(result.output).toContain('the cluster rejected the token');
    expect(result.output).toContain('OPENSHIFT_TOKEN');
  });

  it('AC-016-19: an unreachable cluster is told apart from a bad token', () => {
    const result = preflight('unreachable');
    expect(result.status).toBe(1);
    expect(result.output).toContain('the cluster could not be reached');
    expect(result.output).toContain('OPENSHIFT_SERVER');
  });

  it('AC-016-19: a wrong namespace is named, and none is created', () => {
    const result = preflight('namespace');
    expect(result.status).toBe(1);
    expect(result.output).toContain('the namespace "demo-dev" does not exist');
    expect(result.output).toContain('never creates a namespace');
  });

  it('AC-016-19: a missing permission lists what is missing', () => {
    const result = preflight('permission');
    expect(result.status).toBe(1);
    expect(result.output).toContain('create routes.route.openshift.io');
    expect(result.output).toContain('No cluster-wide right is needed');
  });

  it('AC-016-19: an insufficient quota says how much is needed and how much is free', () => {
    const result = preflight('quota');
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      'requests.cpu: needs 925m, 500m free of 500m (quota compute-deploy)',
    );
    expect(result.output).toContain('Nothing was changed');
    // The quota for builds and jobs does not apply to Deployments.
    expect(result.output).not.toContain('compute-build');
  });
});

describe('deployment workflow (spec 016)', () => {
  const path = '.github/workflows/deploy-openshift-demo.yml';
  const text = read(path);
  const workflow = parse(text) as {
    on: Record<string, unknown>;
    permissions: Record<string, string>;
    concurrency: { group: string; 'cancel-in-progress': boolean };
    jobs: Record<
      string,
      {
        if?: string;
        environment?: string | { name: string };
        permissions?: Record<string, string>;
        steps: { name?: string; uses?: string; run?: string; env?: Record<string, string> }[];
      }
    >;
  };
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
  const scripts = [
    text,
    read('deploy/scripts/preflight.mjs'),
    read('deploy/scripts/verify.mjs'),
    read('deploy/scripts/deploy.sh'),
  ];

  it('AC-016-17: started by hand or after CI on main, never for pull requests', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['workflow_dispatch', 'workflow_run']);
    expect(workflow.on.workflow_run).toMatchObject({
      workflows: ['CI'],
      types: ['completed'],
      branches: ['main'],
    });
    expect(text).not.toMatch(/pull_request/);
    expect(text).toContain("vars.DEPLOY_DEMO_ON_MAIN == 'true'");
    expect(text).toContain("github.event.workflow_run.conclusion == 'success'");
  });

  it('AC-016-17: read-only permissions, the dev environment, one run at a time', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(workflow.jobs)) {
      for (const scope of Object.values(job.permissions ?? {})) expect(scope).toBe('read');
    }
    const deploy = workflow.jobs.deploy!;
    expect(deploy.environment).toEqual({ name: 'dev', url: expect.any(String) });
    // One environment is one namespace: its deployments never overlap and are never cut short.
    expect(workflow.concurrency.group).toBe('deploy-openshift-demo-dev');
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
  });

  it('AC-016-17: uses exactly the documented secrets and variables', () => {
    const secrets = new Set([...text.matchAll(/secrets\.([A-Z_]+)/g)].map((match) => match[1]));
    expect([...secrets].sort()).toEqual(['GRAFANA_ADMIN_PASSWORD', 'OPENSHIFT_TOKEN']);
    const variables = new Set([...text.matchAll(/vars\.([A-Z_]+)/g)].map((match) => match[1]));
    expect([...variables].sort()).toEqual([
      'DEPLOY_DEMO_ON_MAIN',
      'OPENSHIFT_NAMESPACE',
      'OPENSHIFT_SERVER',
    ]);
  });

  it('AC-016-18: third-party actions are pinned to a commit, tools to a checksum', () => {
    const uses = steps.map((step) => step.uses).filter((value): value is string => Boolean(value));
    expect(uses.length).toBeGreaterThan(2);
    for (const action of uses) expect(action, action).toMatch(/@[0-9a-f]{40}$/);
    expect(text).toMatch(/OC_VERSION: '?\d+\.\d+\.\d+/);
    expect(text).toMatch(/HELM_VERSION: '?v\d+\.\d+\.\d+/);
    expect(text.match(/sha256sum --check/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('AC-016-18: no script traces its commands or prints a credential', () => {
    for (const script of scripts) {
      expect(script).not.toMatch(/set -[a-z]*x/);
      // Naming a secret in a message is fine; printing its value is not.
      expect(script).not.toMatch(
        /(echo|printf|console\.log)[^\n|]*\$\{?(OPENSHIFT_TOKEN|GRAFANA_ADMIN_PASSWORD)\b[^\n|]*$/m,
      );
      expect(script).not.toMatch(/cat [^\n]*KUBECONFIG/);
      expect(script).not.toContain('--insecure-skip-tls-verify');
      expect(script).not.toContain('oc whoami -t');
    }
    // The token reaches oc through the environment, never the command line.
    expect(text).not.toMatch(/--token[= ]\$\{\{/);
    expect(text).toContain('KUBECONFIG');
    expect(text).toContain('runner.temp');
  });

  it('AC-016-20: deploys by digest with wait, timeout and rollback, always inside the namespace', () => {
    const deploy = read('deploy/scripts/deploy.sh');
    expect(deploy).toContain('helm upgrade --install');
    for (const flag of [
      '--wait',
      '--timeout',
      '--rollback-on-failure',
      '--namespace "$NAMESPACE"',
    ]) {
      expect(deploy, flag).toContain(flag);
    }
    expect(deploy).toContain('image.digest=');
    expect(deploy).toMatch(/sha256:\[0-9a-f\]\{64\}/);
    // Every oc and helm call that touches the cluster names the namespace.
    for (const script of [
      deploy,
      read('deploy/scripts/verify.mjs'),
      read('deploy/scripts/preflight.mjs'),
    ]) {
      const calls = [
        ...script.matchAll(
          /^.*\b(?:oc|helm) (?:get|apply|create|delete|rollout|exec|upgrade|status|logs|adm|scale|port-forward)\b.*$/gm,
        ),
      ].map((match) => match[0]);
      for (const call of calls) expect(call, call).toMatch(/namespace|NAMESPACE/);
    }
    expect(deploy).not.toMatch(/oc (new-project|adm policy|create namespace)/);
  });
});

describe('deployment guide (spec 016)', () => {
  const guide = read('docs/DEPLOYMENT-OPENSHIFT.md');

  it('AC-016-28: the guide records measured CPU and memory per pod, the quota used and what could not be measured', () => {
    const section = guide.slice(guide.indexOf('### Measured resources'));
    for (const component of [
      'Kritzel',
      'Collector',
      'Prometheus',
      'Loki',
      'Tempo',
      'Grafana',
      'Traffic generator',
    ]) {
      expect(section, component).toMatch(
        new RegExp(`\\| ${component}\\s*\\|\\s*\\d+m \\|\\s*\\d+Mi \\|`),
      );
    }
    expect(section).toContain('Quota used by the demo');
    expect(section).toMatch(/CPU requests \d+m of 3/);
    expect(section).toContain('Could not be measured');
    expect(section).toContain('What this is not: a capacity test');
  });

  it('AC-016-29: the guide covers manual commands, the workflow set-up, rotation, rollback and teardown', () => {
    for (const heading of [
      '## Deploying by hand',
      '## Deploying with GitHub Actions',
      '## The Developer Sandbox',
      '## Rotating credentials',
      '## Rolling back',
      '## Removing the demo',
      '## Troubleshooting',
    ]) {
      expect(guide, heading).toContain(`\n${heading}\n`);
    }
    for (const command of [
      'node deploy/scripts/preflight.mjs',
      'deploy/scripts/deploy.sh',
      'node deploy/scripts/verify.mjs',
      'helm rollback kritzel',
      'helm uninstall kritzel',
    ]) {
      expect(guide, command).toContain(command);
    }
    for (const name of [
      'OPENSHIFT_TOKEN',
      'OPENSHIFT_SERVER',
      'OPENSHIFT_NAMESPACE',
      'GRAFANA_ADMIN_PASSWORD',
    ]) {
      expect(guide, name).toContain(`\`${name}\``);
    }
    // A rollback is not free: the guide has to say what it does to running games.
    const rollback = guide.slice(
      guide.indexOf('## Rolling back'),
      guide.indexOf('## Removing the demo'),
    );
    expect(rollback).toContain('games in progress end');
    expect(read('README.md')).toContain('docs/DEPLOYMENT-OPENSHIFT.md');
    expect(read('docs/HOSTING.md')).toContain('DEPLOYMENT-OPENSHIFT.md');
  });
});
