#!/usr/bin/env bash
# Scans the history of the checked-out commit for secrets with gitleaks
# (spec 017). A finding is exit code 1; found values are not printed.
#
# Usage: scripts/scan-secrets.sh
# Needs a full clone: in a shallow one only the fetched commits are scanned.
set -euo pipefail

# Raised by hand: Dependabot does not see images named in scripts.
GITLEAKS_IMAGE='ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f'

root="$(cd "$(dirname "$0")/.." && pwd)"

docker run --rm --volume "$root:/repo:ro" "$GITLEAKS_IMAGE" git /repo \
  --redact \
  --no-banner \
  --exit-code 1
