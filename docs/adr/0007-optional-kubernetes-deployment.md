# Kubernetes is an optional way to run Kritzel, with one game replica

Hosting Kritzel stays a single `docker run` (spec 012). A Helm chart is added for teams that run everything on a cluster and for the public demo on the OpenShift Developer Sandbox. The chart does not change what Kritzel is: one process holding every room in memory (ADR 0001).

The chart therefore fixes the game at one replica with the `Recreate` strategy and refuses anything else when it is rendered. A rolling update would run two game processes side by side, each with its own rooms, and a second replica behind one Service would send the players of a room to different processes. A restart ends the games in progress; that was already true for the container and is accepted.

The chart needs nothing beyond a namespace: no operator, no custom resource definition, no cluster role, no privileged pod. The observability stack of spec 015 comes as plain Deployments with ephemeral storage, because the namespace of a trial cluster is all the demo can count on. The chart mounts the same configuration files the Compose stack uses, so there is one configuration to verify.

## Considered options

- **Operators for Prometheus, Loki, Tempo and Grafana**: the usual way on a cluster, but they need cluster-wide rights and custom resources the sandbox does not grant, and they would hide how little the demo needs.
- **The cluster's own monitoring** (user workload monitoring, ServiceMonitor): covers metrics only, differs between clusters, and would make the demo depend on platform features.
- **A StatefulSet with persistent volumes by default**: survives restarts, but the demo is meant to be disposable, and persistent volumes are optional values for regular installations.
- **A hop count for proxy trust**: simple to configure, but it cannot tell a proxy from a client that connects directly; Fastify refuses it for that reason. `TRUST_PROXY` takes a list of proxy networks instead.

## Consequences

- An upgrade or rollback of the game always interrupts play. The deployment workflow says so, and repeats nothing that did not change.
- The demo keeps no telemetry across restarts and is not highly available.
- Network policies restrict who may connect to each pod, but only as far as the cluster lets them: a platform policy that allows all traffic inside the namespace, as on the Developer Sandbox, cannot be taken away by the chart.
- Kubernetes cannot verify that a named image user is not root. OpenShift assigns a user id itself; elsewhere `securityContext.runAsUser` has to be set.
