#!/usr/bin/env bash
# Deploys the observability stack and the Kritzel demo profile to an existing
# namespace (spec 016). Used by deploy-openshift-demo and by hand:
#
#   NAMESPACE=myuser-dev IMAGE_DIGEST=sha256:... deploy/scripts/deploy.sh
#
# Required:  NAMESPACE, IMAGE_DIGEST
# Optional:  IMAGE_REPOSITORY        default ghcr.io/mistral-valaise/open-skribbl
#            RELEASE                 default kritzel
#            OBS_RELEASE             default <RELEASE>-obs
#            GRAFANA_ROUTE           true (default) or false
#            TRAFFIC                 true (default) or false
#            GRAFANA_ADMIN_PASSWORD  stored in the Secret <release>-grafana; when
#                                    unset, an existing Secret is kept, and one
#                                    is generated on first use
#            TIMEOUT                 default 10m
#
# `oc` and `helm` must be logged in to the cluster (KUBECONFIG). Every command
# names the namespace. Nothing outside the releases and their Secret is touched,
# and no password is printed.
#
# An upgrade restarts the game when its image or settings changed. Games in
# progress end; players are told the server is restarting.
set -euo pipefail

: "${NAMESPACE:?set NAMESPACE to the existing namespace}"
: "${IMAGE_DIGEST:?set IMAGE_DIGEST to the sha256 digest of the game image}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-ghcr.io/mistral-valaise/open-skribbl}"
RELEASE="${RELEASE:-kritzel}"
OBS_RELEASE="${OBS_RELEASE:-${RELEASE}-obs}"
GRAFANA_ROUTE="${GRAFANA_ROUTE:-true}"
TRAFFIC="${TRAFFIC:-true}"
TIMEOUT="${TIMEOUT:-10m}"
HELM_ROOT="$(cd "$(dirname "$0")/../helm" && pwd)"
CHART="${HELM_ROOT}/kritzel"
OBS_CHART="${HELM_ROOT}/kritzel-observability"
SECRET="${RELEASE}-grafana"

if [[ ! "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "IMAGE_DIGEST must look like sha256:<64 hex digits>: deployments pin an immutable image." >&2
  exit 2
fi
for flag in "$GRAFANA_ROUTE" "$TRAFFIC"; do
  if [[ "$flag" != true && "$flag" != false ]]; then
    echo "GRAFANA_ROUTE and TRAFFIC must be true or false." >&2
    exit 2
  fi
done

# The Grafana admin credentials live in a Secret and nowhere else. The password
# is passed on standard input, so it never appears in a command line or output.
PASSWORD_CHANGED=false
if [[ -n "${GRAFANA_ADMIN_PASSWORD:-}" ]]; then
  # Applying reports "configured" when the Secret existed with another value.
  applied="$(printf '%s' "$GRAFANA_ADMIN_PASSWORD" |
    oc create secret generic "$SECRET" --namespace "$NAMESPACE" \
      --from-literal=admin-user=admin \
      --from-file=admin-password=/dev/stdin --dry-run=client --output yaml |
    oc apply --namespace "$NAMESPACE" --filename - 2>/dev/null)"
  if [[ "$applied" == *configured* ]]; then PASSWORD_CHANGED=true; fi
  echo "Grafana admin password stored in the Secret $SECRET."
elif oc get secret "$SECRET" --namespace "$NAMESPACE" >/dev/null 2>&1; then
  echo "Keeping the existing Secret $SECRET."
else
  head -c 24 /dev/urandom | base64 | tr -d '\n=+/' |
    oc create secret generic "$SECRET" --namespace "$NAMESPACE" \
      --from-literal=admin-user=admin \
      --from-file=admin-password=/dev/stdin >/dev/null
  echo "Generated a Grafana admin password into the Secret $SECRET."
fi
oc label secret "$SECRET" --namespace "$NAMESPACE" --overwrite \
  app.kubernetes.io/part-of=kritzel >/dev/null

if [[ ! -d "$OBS_CHART/charts" ]] || [[ -z "$(ls -A "$OBS_CHART/charts" 2>/dev/null)" ]]; then
  helm dependency build "$OBS_CHART"
fi

helm upgrade --install "$OBS_RELEASE" "$OBS_CHART" --namespace "$NAMESPACE" \
  --values "$OBS_CHART/values-demo.yaml" \
  --set-string "grafana.admin.existingSecret=$SECRET" \
  --set "grafanaRoute.enabled=$GRAFANA_ROUTE" \
  --wait --timeout "$TIMEOUT" --rollback-on-failure

helm upgrade --install "$RELEASE" "$CHART" --namespace "$NAMESPACE" \
  --values "$CHART/values-demo.yaml" \
  --set-string "image.repository=$IMAGE_REPOSITORY" \
  --set-string "image.digest=$IMAGE_DIGEST" \
  --set-string "telemetry.otlpEndpoint=http://${OBS_RELEASE}-opentelemetry-collector:4318" \
  --set "traffic.enabled=$TRAFFIC" \
  --wait --timeout "$TIMEOUT" --rollback-on-failure

# Grafana reads the password when it starts. A changed Secret alone does not
# restart it, so an already running Grafana would keep the old password.
if [[ "$PASSWORD_CHANGED" == true ]] &&
  oc get deployment "${OBS_RELEASE}-grafana" --namespace "$NAMESPACE" >/dev/null 2>&1; then
  oc rollout restart "deployment/${OBS_RELEASE}-grafana" --namespace "$NAMESPACE" >/dev/null
  oc rollout status "deployment/${OBS_RELEASE}-grafana" --namespace "$NAMESPACE" --timeout=180s >/dev/null
  echo "Grafana restarted to apply the changed password."
fi

helm status "$OBS_RELEASE" --namespace "$NAMESPACE" | sed -n '1,8p'
helm status "$RELEASE" --namespace "$NAMESPACE" | sed -n '1,8p'
