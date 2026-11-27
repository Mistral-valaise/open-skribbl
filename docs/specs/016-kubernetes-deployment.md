# 016 — Kubernetes and OpenShift deployment

|           |          |
| --------- | -------- |
| Status    | Approved |
| Milestone | M6       |

## Intent

Some teams run everything on a cluster. A Helm chart lets them install Kritzel there, alone or together with the observability stack of spec 015, without cluster-admin rights. A GitHub Actions workflow uses the chart to keep a public demo on the Red Hat OpenShift Developer Sandbox. `docker run` stays the primary way to host Kritzel.

## Behaviour

- `helm install kritzel deploy/helm/kritzel` installs the game alone. Adding `-f deploy/helm/kritzel/values-demo.yaml` installs the demo profile: the game with telemetry on, an OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana and the traffic generator.
- Everything lives in one namespace that already exists. The chart creates no cluster-wide object and needs no operator or custom resource definition.
- On OpenShift the game is reachable through an edge-terminated Route. Grafana gets a Route only when asked for, and always with a login. The collector and the backends are never exposed.
- The workflow `deploy-openshift-demo` deploys a chosen commit of `main` to the demo namespace, checks that the game and the telemetry work, and reports what it found. Deploying again changes nothing that did not change.
- An upgrade, a rollback or a pod restart ends the games in progress; players are told the server is restarting (spec 007). The demo keeps no data: a restarted backend starts empty.

## Rules

### Chart

- Path `deploy/helm/kritzel`. Kinds: Deployment, Service, ServiceAccount, ConfigMap, NetworkPolicy, Route (OpenShift), PersistentVolumeClaim (optional). Nothing else.
- The game runs as exactly one replica with the `Recreate` strategy, so two game processes never overlap (ADR 0001). Any other replica count is refused when the chart is rendered.
- Every container runs under the `restricted-v2` security context constraint and the Kubernetes restricted profile: no fixed user or group id, `runAsNonRoot`, no privilege escalation, all capabilities dropped, `RuntimeDefault` seccomp, read-only root file system, writable paths only as `emptyDir` volumes with a size limit.
- Every container declares requests and limits for CPU, memory and ephemeral storage.
- Every pod has its own ServiceAccount and does not mount its token.
- The observability images are pinned by digest. The game image is given by digest in the demo profile.
- The collector, Prometheus, Loki, Tempo and Grafana read the same configuration files as the Compose stack; the chart ships them unchanged under `files/`.
- Secrets are never chart values. The Grafana admin password comes from an existing Secret named in `grafana.existingSecret` (key `admin-password`).
- Probes: the game has start-up, readiness and liveness probes on `/healthz`, which does not depend on telemetry. Each other component has probes on its own health endpoint.
- NetworkPolicies allow: the ingress router to the game and, when its Route is on, to Grafana; the game to the collector's OTLP port; the collector to the backends; Grafana to the backends; the traffic generator to the game. Everything else into the chart's pods is denied by the chart. A cluster may add its own policies; on the Developer Sandbox a platform policy allows all traffic inside the namespace, which the chart cannot take away.

### Initial resources

| Component         | CPU request | CPU limit | Memory request | Memory limit | Ephemeral storage limit |
| ----------------- | ----------: | --------: | -------------: | -----------: | ----------------------: |
| Kritzel           |        100m |     1000m |          128Mi |        512Mi |                   128Mi |
| Collector         |        100m |      500m |          128Mi |        256Mi |                   128Mi |
| Prometheus        |        200m |     1000m |          256Mi |        768Mi |                     2Gi |
| Loki              |        200m |     1000m |          256Mi |        768Mi |                     2Gi |
| Tempo             |        200m |     1000m |          256Mi |        768Mi |                     2Gi |
| Grafana           |        100m |      500m |          128Mi |        384Mi |                   512Mi |
| Traffic generator |         25m |      200m |           48Mi |        128Mi |                    64Mi |

These are starting values. `docs/DEPLOYMENT-OPENSHIFT.md` records what a running demo actually used.

### Proxy trust

`TRUST_PROXY` accepts a list of proxy addresses and networks (spec 012). The demo profile sets it to the cluster's pod network, where the ingress router lives, so the address the router appended is used for the per-address limits and an address a client invents is not.

### Deployment workflow

- `.github/workflows/deploy-openshift-demo.yml`, started by hand (`workflow_dispatch`) with the commit to deploy, and optionally after a successful CI run on `main` when the repository variable `DEPLOY_DEMO_ON_MAIN` is `true`. It never runs for pull requests.
- It runs in the GitHub environment `dev` and uses exactly: the secret `OPENSHIFT_TOKEN`, the variables `OPENSHIFT_SERVER` and `OPENSHIFT_NAMESPACE`, and optionally the secret `GRAFANA_ADMIN_PASSWORD`.
- Only commits that are on `main` and whose CI run succeeded are deployed. The image is taken from GHCR by the digest of its `sha-<commit>` tag.
- Runs for the same namespace never overlap. Workflow permissions are read-only. Third-party actions are pinned to a full commit SHA; `oc` and `helm` are pinned versions verified by checksum.
- Credentials go into a temporary kubeconfig, TLS verification stays on, and no step prints a token, a password, a kubeconfig or a room code.
- **Preflight** (`deploy/scripts/preflight.sh`) stops before anything is changed, with a message that says what to do, when: the token is rejected, the namespace is not the expected one, a required permission is missing, or the quota cannot hold the chart's requests and limits.
- **Deploy**: `helm upgrade --install` with `--wait`, a timeout, and rollback on failure. It touches only the release's own objects.
- **Verify** (`deploy/scripts/verify.sh`): pods ready and running with a user id from the namespace's range; the Route serves the app over HTTPS and redirects HTTP; a complete game with a reconnect is played over `wss://` through the Route; metrics, logs and traces of that run are in the backends; Grafana's data sources are healthy and the dashboards present.
- The run summary lists commit, image digest, chart version, namespace, URLs and the result of every check.

### Limits of the demo

The Developer Sandbox is a trial environment. It stops idle workloads and expires accounts; `docs/DEPLOYMENT-OPENSHIFT.md` quotes the current terms from Red Hat's documentation. The demo is not highly available, keeps nothing, and makes no promise of uptime.

## Acceptance criteria

- **AC-016-01** `helm lint` passes for the default values and for the demo profile.
- **AC-016-02** With default values the chart renders the game only: one Deployment, one Service, one ServiceAccount, one NetworkPolicy, no telemetry variable and none of the observability components.
- **AC-016-03** With the demo profile the chart renders one Deployment each for the game, collector, Prometheus, Loki, Tempo, Grafana and the traffic generator, and the game has `TELEMETRY_ENABLED=true` and the collector's address.
- **AC-016-04** A replica count other than 1 fails rendering with a message naming the value, and the game's Deployment uses the `Recreate` strategy.
- **AC-016-05** In both profiles every container sets `runAsNonRoot`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile: RuntimeDefault` and `readOnlyRootFilesystem: true`, and no pod sets `runAsUser`, `fsGroup`, `hostNetwork`, `hostPID`, a `hostPath` volume or `privileged`.
- **AC-016-06** Every container has requests and limits for CPU, memory and ephemeral storage, and every `emptyDir` has a size limit.
- **AC-016-07** The chart renders only the kinds listed under "Chart", all of them namespaced.
- **AC-016-08** Every pod uses a ServiceAccount of its own and sets `automountServiceAccountToken: false`.
- **AC-016-09** Every observability image is pinned by digest, and the demo profile refuses a game image without a digest.
- **AC-016-10** The game's Route terminates TLS at the edge, redirects HTTP and sets a tunnel timeout; no Route exists for the collector, Prometheus, Loki or Tempo; Grafana's Route exists only when enabled.
- **AC-016-11** Grafana reads its admin password from the named existing Secret, anonymous access is off, and neither the chart's values nor its rendered output contain a password.
- **AC-016-12** The NetworkPolicies allow exactly the connections listed under "Chart".
- **AC-016-13** The configuration the chart mounts into the collector, Prometheus, Loki, Tempo and Grafana is the same set of files the Compose overlay mounts.
- **AC-016-14** The game's probes use `/healthz` only, and its termination grace period is at least 15 s.
- **AC-016-15** `TRUST_PROXY` accepts a list of proxy addresses and networks; behind a listed proxy the address the proxy appended is used for rate limits, and a client that is not a listed proxy cannot choose its address.
- **AC-016-16** The demo profile sets `MAX_ROOMS`, the trace sampler and the retention of every backend from values.
- **AC-016-17** The workflow is started only by `workflow_dispatch` or by a completed CI run on `main`, has read-only permissions, uses the environment `dev`, serialises runs per namespace, and references no secret or variable other than the four named above.
- **AC-016-18** Every third-party action in the workflow is pinned to a 40-character commit SHA, and no script enables shell tracing or prints a credential.
- **AC-016-19** The preflight exits non-zero with a specific message for a rejected token, a wrong namespace, a missing permission and an insufficient quota, and exits zero when all hold.
- **AC-016-20** The workflow deploys the game image by digest with `helm upgrade --install --wait`, a timeout and rollback on failure, and scopes every `oc` and `helm` command to the namespace.
- **AC-016-21** On the Developer Sandbox every pod of the demo profile becomes ready under `restricted-v2` with a user id from the namespace's range.
- **AC-016-22** Through the Route, `https://` serves the app, `http://` redirects to it, and the traffic generator completes a game with a reconnect over `wss://`.
- **AC-016-23** Grafana's Route requires a login; with it, the three data sources are healthy and the seven dashboards present. The collector, Prometheus, Loki and Tempo have no Route.
- **AC-016-24** The observability checks of spec 015 (metrics, logs, traces, the four correlation directions, the collector's allowlist, the Sloth objectives) pass against the sandbox deployment.
- **AC-016-25** Running the deployment a second time with the same inputs leaves the game's pod running: no restart, no ended game.
- **AC-016-26** A restart of the game's pod sends `server.shutdown` to a connected client before the connection closes.
- **AC-016-27** With the collector scaled to zero, a complete game is still played through the Route.
- **AC-016-28** `docs/DEPLOYMENT-OPENSHIFT.md` records the measured CPU and memory of every pod, the quota used, and what could not be measured.
- **AC-016-29** `docs/DEPLOYMENT-OPENSHIFT.md` documents the manual Helm commands, the GitHub Actions set-up, token rotation, rollback with its effect on running games, and teardown.

## Blocked criteria

Issue #4 also asks to verify host access controls and Origin validation through the Route. Those features belong to issues #1 and #2 and do not exist yet, so they are not criteria here. Until #1 lands, the public Route is protected only by `MAX_ROOMS`, the per-address rate limits and the namespace quota.

## Out of scope

High availability, more than one game replica, persistent game state, cluster-wide monitoring, operators and custom resources, privileged collectors, other cloud platforms, an Alertmanager, guaranteed uptime of the demo.
