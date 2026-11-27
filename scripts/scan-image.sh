#!/usr/bin/env bash
# Scans a published container image for vulnerabilities, the way the release
# does (spec 017): Trivy, CRITICAL and HIGH only, only those with a fix, both
# platforms. A finding is exit code 1. Exceptions live in .trivyignore, each
# with a reason and an expiry date.
#
# Usage: scripts/scan-image.sh <image reference in a registry>
#   scripts/scan-image.sh ghcr.io/mistral-valaise/open-skribbl@sha256:…
#
# REGISTRY_AUTH_FILE  optional path to a Docker config.json with the login of a
#                     private registry; it is mounted read-only, never passed
#                     on the command line.
# SCAN_PLATFORMS      platforms to scan, default "linux/amd64 linux/arm64".
set -euo pipefail

# Raised by hand: Dependabot does not see images named in scripts.
TRIVY_IMAGE='ghcr.io/aquasecurity/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb'

image="${1:?Usage: scripts/scan-image.sh <image reference>}"
root="$(cd "$(dirname "$0")/.." && pwd)"

mounts=(--volume "$root/.trivyignore:/work/.trivyignore:ro" --volume kritzel-trivy-cache:/root/.cache/trivy)
if [ -n "${REGISTRY_AUTH_FILE:-}" ]; then
  mounts+=(--volume "$REGISTRY_AUTH_FILE:/root/.docker/config.json:ro")
fi

for platform in ${SCAN_PLATFORMS:-linux/amd64 linux/arm64}; do
  echo "Scanning $image ($platform)" >&2
  docker run --rm "${mounts[@]}" "$TRIVY_IMAGE" image \
    --scanners vuln \
    --severity CRITICAL,HIGH \
    --ignore-unfixed \
    --exit-code 1 \
    --ignorefile /work/.trivyignore \
    --platform "$platform" \
    --no-progress \
    "$image"
done
