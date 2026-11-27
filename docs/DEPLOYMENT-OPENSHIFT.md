# Deploying Kritzel to OpenShift

Kritzel is hosted with one `docker run` ([hosting guide](HOSTING.md)). This guide is for the other case: a cluster, and in particular the demo on the Red Hat OpenShift Developer Sandbox with the observability stack of [OBSERVABILITY.md](OBSERVABILITY.md). Behaviour is specified in [spec 016](specs/016-kubernetes-deployment.md); the reasons are in [ADR 0007](adr/0007-optional-kubernetes-deployment.md).

The demo is disposable. One game process holds every room in memory, the telemetry backends keep their data in the pod, and nothing is highly available. An upgrade, a rollback or a pod restart ends the games in progress; players see "The server is restarting".

## What gets installed

`deploy/helm/kritzel` has two profiles:

| Profile             | Values file        | Installs                                                                                                                                           |
| ------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Game only (default) | `values.yaml`      | The game: one Deployment, Service, ServiceAccount and NetworkPolicy. No telemetry.                                                                 |
| Demo                | `values-demo.yaml` | The game with telemetry, an OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana, the traffic generator, and Routes for the game and Grafana. |

Everything is namespaced: Deployments, Services, ServiceAccounts, ConfigMaps, NetworkPolicies, Routes and, only if asked for, PersistentVolumeClaims. The chart needs no operator, no custom resource definition and no cluster role. Every container runs under the `restricted-v2` security context constraint with a read-only root file system and its own ServiceAccount without a mounted token. The collector, the backends and Grafana read the same configuration files as the Compose stack (`deploy/helm/kritzel/files/`).

## Deploying by hand

You need `oc`, `helm` 4, a namespace that exists and a login to it. Nothing below creates a namespace or touches anything outside the release.

```sh
oc login --token=<token> --server=https://api.<cluster>:6443
export NAMESPACE=<user>-dev

# 1. Render and check before anything changes.
helm template kritzel deploy/helm/kritzel --namespace "$NAMESPACE" \
  --values deploy/helm/kritzel/values-demo.yaml \
  --set-string image.digest=sha256:<digest> \
  --set-string grafana.existingSecret=kritzel-grafana > /tmp/kritzel.yaml
node deploy/scripts/preflight.mjs --namespace "$NAMESPACE" --manifests /tmp/kritzel.yaml

# 2. Deploy. The script stores the Grafana password in a Secret, then runs
#    helm upgrade --install --wait --timeout 10m --rollback-on-failure.
NAMESPACE="$NAMESPACE" IMAGE_DIGEST=sha256:<digest> deploy/scripts/deploy.sh

# 3. Check the result from the outside.
node deploy/scripts/verify.mjs --namespace "$NAMESPACE"
```

- **The image** is given by digest, never by a moving tag. Every commit of `main` is published as `ghcr.io/mistral-valaise/open-skribbl:sha-<commit>`; read its digest with `docker buildx imagetools inspect ghcr.io/mistral-valaise/open-skribbl:sha-<commit>`. That tag is pushed before the release workflow has tested, scanned and signed the image; [verify the signature](HOSTING.md#verifying-the-signature) of the digest to know that it passed. A release has the same digest as the `sha-<commit>` image of its commit. The GHCR package has to be public, or the namespace needs a pull secret named in `imagePullSecrets`.
- **The Grafana password** is never a chart value. `deploy.sh` takes it from `GRAFANA_ADMIN_PASSWORD` and writes it to the Secret `kritzel-grafana` (key `admin-password`). Without the variable it keeps an existing Secret, or generates a password on first use. Read it with `oc get secret kritzel-grafana --namespace "$NAMESPACE" -o jsonpath='{.data.admin-password}' | base64 -d`.
- **Options** of `deploy.sh`: `GRAFANA_ROUTE=false` keeps Grafana off the internet (use `oc port-forward --namespace "$NAMESPACE" service/kritzel-grafana 3001:3000`), `TRAFFIC=false` leaves the traffic generator out, `IMAGE_REPOSITORY` and `RELEASE` change their defaults.
- **Game only**: `helm upgrade --install kritzel deploy/helm/kritzel --namespace "$NAMESPACE" --set route.enabled=true`.
- **Outside OpenShift** there are no Routes; bring your own Ingress. Kubernetes cannot verify that the named user of the game and Prometheus images is not root, so set `securityContext.runAsUser` (for example `1000`).

The preflight changes nothing. It stops, with a line saying what to do, when the token is rejected, the cluster cannot be reached, the namespace does not exist, a permission is missing, or the quota or LimitRange cannot hold the chart's requests and limits.

## Deploying with GitHub Actions

The workflow `.github/workflows/deploy-openshift-demo.yml` does the same three steps and writes the result into the run summary.

Set up once, in **Settings → Environments → `dev`**:

| Kind     | Name                     | Value                                                             |
| -------- | ------------------------ | ----------------------------------------------------------------- |
| Secret   | `OPENSHIFT_TOKEN`        | A login token for the namespace                                   |
| Variable | `OPENSHIFT_SERVER`       | The API URL, `https://api.<cluster>:6443`                         |
| Variable | `OPENSHIFT_NAMESPACE`    | The existing namespace, on the sandbox `<user>-dev`               |
| Secret   | `GRAFANA_ADMIN_PASSWORD` | Optional. Without it a password is generated into the Secret once |

Also in the environment, restrict **Deployment branches** to `main`. The workflow refuses commits that are not on `main` on its own, but the environment should not hand its secrets to another branch either.

Run it from **Actions → Deploy OpenShift demo → Run workflow**. Inputs: the commit (default: the head of `main`), optionally an image digest, whether Grafana gets a Route, whether synthetic traffic runs. To deploy after every successful CI run on `main`, set the repository variable `DEPLOY_DEMO_ON_MAIN` to `true`.

What it guarantees:

- It runs only by hand or after CI on `main`, never for a pull request, so code from a fork never meets the credentials.
- It deploys only a commit that is on `main` and whose CI run succeeded, by the digest of that commit's image.
- One run at a time; a run is never cancelled halfway.
- Permissions are read-only. Actions are pinned to commit SHAs; `oc` and `helm` are downloaded in pinned versions and verified by checksum.
- The token goes into a temporary kubeconfig that is deleted at the end. No step prints a token, a password or a kubeconfig, and room codes are removed from the logs it collects on failure.

## The Developer Sandbox

Red Hat's [Developer Sandbox FAQ](https://developers.redhat.com/developer-sandbox/FAQ) states, as read on 2026-11-27, that a sandbox is active for 30 days and that pods are stopped after running for 12 consecutive hours; they are started again by scaling the Deployment back up ([how to revive them](https://developers.redhat.com/learn/openshift/revive-inactive-openshift-pods-scaled-zero)). Check the FAQ for the current terms; they are Red Hat's to change.

For the demo that means:

- It stops by itself, at the latest after twelve hours. Run the workflow again, or `oc scale deployment --namespace "$NAMESPACE" --selector app.kubernetes.io/instance=kritzel --replicas=1`. Everything starts empty: no rooms, no metrics, no logs, no traces.
- The login token expires, usually within a day. When the workflow's preflight says the token was rejected, copy a new one from the console ("Copy login command") into the secret `OPENSHIFT_TOKEN`.
- After 30 days the sandbox and everything in it is gone. Nothing here works around that.
- `KritzelTelemetryMissing` firing because the sandbox stopped the pods is not an incident.

## What was verified on the sandbox

On 2026-11-27, in the namespace `valaise16-dev` (OpenShift 4.22, Kubernetes 1.35), with an image built from this branch inside the namespace, because no image of this code was in GHCR yet. The checks are scripts and tests in this repository:

| What                                                                                                                                                                                                      | How                                                                                                      | Result |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ |
| Seven pods ready under `restricted-v2`, each with user id 1002340000 from the namespace's range 1002340000/10000                                                                                          | `deploy/scripts/verify.mjs`                                                                              | passed |
| Routes for the game and Grafana only, edge TLS, HTTP redirected (302); security headers present                                                                                                           | `deploy/scripts/verify.mjs`                                                                              | passed |
| A complete three-player game over `wss://` through the Route, with one connection dropped and resumed                                                                                                     | `deploy/scripts/verify.mjs`                                                                              | passed |
| Grafana refuses anonymous access (401); three data sources healthy; seven dashboards present                                                                                                              | `deploy/scripts/verify.mjs`                                                                              | passed |
| Metrics, logs with trace ids and traces in the backends; four objectives evaluated                                                                                                                        | `deploy/scripts/verify.mjs`                                                                              | passed |
| The eight checks of spec 015, including exemplar → trace → logs → trace → metrics and the collector's allowlist                                                                                           | `e2e/observability.spec.ts` with `KRITZEL_OPENSHIFT_NAMESPACE`; trace `9339692fbbc25318dee7adecce6f5156` | passed |
| Deploying the same inputs again: new Helm revision, same game pod, no restart                                                                                                                             | `e2e/openshift.spec.ts`                                                                                  | passed |
| With the collector scaled to zero, a complete game through the Route                                                                                                                                      | `e2e/openshift.spec.ts`                                                                                  | passed |
| Restarting the game: a browser connected over `wss://` shows "The server is restarting"                                                                                                                   | `e2e/openshift.spec.ts`                                                                                  | passed |
| Per-address limits use the address the router appended: 14 simultaneous room creations each claiming another address shared one budget (3 × 201, 11 × 429), while a request from another source succeeded | by hand, `curl` and `oc exec`                                                                            | passed |
| The typing layout with a real on-screen keyboard, solo mode, Safari in the iOS Simulator                                                                                                                  | by hand                                                                                                  | passed |

Not verified: the workflow itself (it can only run once it is on `main`), a rollback of a failed upgrade (none failed), behaviour over more than a few hours, and a real Android or iOS device.

### Measured resources

One sample with `oc adm top pods` after about two hours and fifteen minutes of synthetic traffic (two rooms of three players playing continuously):

| Component         | CPU | Memory | Memory limit | Note                                                                                |
| ----------------- | --: | -----: | -----------: | ----------------------------------------------------------------------------------- |
| Kritzel           | 23m |   42Mi |        512Mi |                                                                                     |
| Collector         |  3m |   93Mi |        256Mi |                                                                                     |
| Prometheus        |  7m |   57Mi |        768Mi | 7.1 MB on disk                                                                      |
| Loki              | 11m |   92Mi |        768Mi |                                                                                     |
| Tempo             | 16m |  232Mi |        768Mi |                                                                                     |
| Grafana           | 23m |  349Mi |        384Mi | Killed for memory once at this limit. The limit is now 768Mi and the request 256Mi. |
| Traffic generator |  3m |   23Mi |        128Mi |                                                                                     |

Quota used by the demo after that change, of what the sandbox allows: CPU requests 925m of 3, memory requests 1328Mi of 30Gi, CPU limits 5200m of 30, memory limits 3968Mi of 30Gi, ephemeral storage limits 6976Mi of 15Gi, no persistent volume claims.

What this is not: a capacity test. The load was two small rooms. The capacity of the game itself is in the [hosting guide](HOSTING.md#capacity).

Could not be measured: the disk usage of Loki and Tempo (their images have no shell to run `du` in, and no privileged collector was added to find out), network traffic, and anything about the node. The Runtime & Infrastructure dashboard says the same.

## Security notes

- **The game's Route is public.** Origin checks, connection limits and heartbeats belong to issue #1 and do not exist yet. Until then the demo is protected by `MAX_ROOMS=50`, the per-address rate limits and the namespace quota. Do not treat the demo as hardened.
- **Proxy trust.** The demo sets `TRUST_PROXY=10.128.0.0/14`, the cluster's pod network, where the ingress router runs. Forwarded addresses are believed only on connections from there, and the address the router appended counts. On a cluster with another pod network, set `game.trustProxy` accordingly.
- **Network policies.** The chart allows each pod only its callers (router → game and Grafana, game → collector, collector and Grafana → backends, traffic generator → game). The Developer Sandbox adds its own policy that allows all traffic inside the namespace; policies add up, so there the chart's rules restrict traffic from other namespaces but not between the release's own pods. Egress is not restricted.
- **Grafana** is reachable from the internet behind its own login when its Route is on. Use a strong `GRAFANA_ADMIN_PASSWORD`, or turn the Route off. There is no single sign-on.
- **Secrets.** The token lives in the GitHub environment, the Grafana password in a Secret. Neither is in the chart, the values or the logs.

## Rotating credentials

- **Token**: copy a new login command from the OpenShift console and replace the secret `OPENSHIFT_TOKEN`. Nothing in the cluster needs to change.
- **Grafana password**: replace the secret `GRAFANA_ADMIN_PASSWORD` and run the workflow, or run `deploy.sh` with the variable set. Grafana reads the password when it starts, so the script restarts Grafana when the Secret's value changed; its database is ephemeral and is created anew with the new password.

## Rolling back

```sh
helm history kritzel --namespace "$NAMESPACE"
helm rollback kritzel <revision> --namespace "$NAMESPACE" --wait --timeout 10m
```

A rollback that changes the game's image or settings restarts the game: games in progress end, and players are told the server is restarting. A failed `helm upgrade` is rolled back automatically (`--rollback-on-failure`), with the same effect if the game had already been replaced. To go back to an earlier commit, run the workflow with that commit; it is deployed by its own digest.

## Removing the demo

```sh
helm uninstall kritzel --namespace "$NAMESPACE"
oc delete secret kritzel-grafana --namespace "$NAMESPACE"
```

This removes the release's objects and the Grafana password and nothing else. If the image was built inside the namespace instead of pulled from GHCR, also remove that build: `oc delete buildconfig,imagestream kritzel-demo --namespace "$NAMESPACE"`.

## Troubleshooting

| Symptom                                                     | Likely cause and what to do                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Preflight: "the cluster rejected the token"                 | The token expired. Replace `OPENSHIFT_TOKEN`.                                                                                                    |
| Preflight: "the namespace quota cannot hold the deployment" | Other workloads use the quota. Remove them, or lower requests and limits in the values. The message lists what is short.                         |
| A pod stays in `ImagePullBackOff`                           | The GHCR package is private, or the digest does not exist. Make the package public, add `imagePullSecrets`, or check the digest.                 |
| No pods at all, Deployments at zero replicas                | The sandbox stopped them after twelve hours. Scale back up or run the workflow.                                                                  |
| Grafana restarts                                            | Look at `oc get pod --namespace "$NAMESPACE"` for `OOMKilled`; raise `grafana.resources.limits.memory`.                                          |
| Dashboards are empty                                        | The backends are ephemeral and start empty after a restart; the traffic generator fills them within a few minutes. See [RUNBOOK.md](RUNBOOK.md). |
| Players lose their connection after an hour without play    | The router closes an idle WebSocket after `route.tunnelTimeout` (1h). The game has no heartbeat yet; the client reconnects on its own.           |
