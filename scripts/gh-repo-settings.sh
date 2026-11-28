#!/usr/bin/env bash
# Idempotently configures GitHub repository settings, labels, and branch/tag
# rulesets for Mistral-valaise/open-skribbl via `gh`.
#
# Usage: scripts/gh-repo-settings.sh [owner/repo]
set -euo pipefail

REPO="${1:-Mistral-valaise/open-skribbl}"

echo "==> Updating repository merge & branch deletion settings on $REPO"
gh api --method PATCH "repos/$REPO" \
  --field delete_branch_on_merge=true \
  --field allow_auto_merge=true \
  --silent

echo "==> Enabling GitHub Actions PR creation while keeping read-only default token permissions on $REPO"
gh api --method PUT "repos/$REPO/actions/permissions/workflow" \
  --field default_workflow_permissions=read \
  --field can_approve_pull_request_reviews=true \
  --silent

echo "==> Ensuring structured labels exist on $REPO"
ensure_label() {
  local name="$1" color="$2" desc="$3"
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" --force >/dev/null
}

ensure_label "priority: p0"        "b60205" "Critical priority — blocks release or public exposure"
ensure_label "priority: p1"        "d93f0b" "High priority — planned for current milestone"
ensure_label "priority: p2"        "fbca04" "Normal priority"
ensure_label "milestone: m5"       "5319e7" "M5 — Security, reliability, and product excellence"
ensure_label "milestone: m6"       "0e8a16" "M6 — Cloud-native operations and observability"
ensure_label "area: web"           "1d76db" "React client (apps/web)"
ensure_label "area: server"        "006b75" "Node HTTP/WebSocket server (apps/server)"
ensure_label "area: shared"        "0052cc" "Pure rules, protocol, and drawing model (packages/shared)"
ensure_label "area: content"       "c2e0c6" "Word lists and solo drawings (packages/content)"
ensure_label "area: helm"          "326ce5" "Helm charts and cluster deployment (deploy/)"
ensure_label "area: ci"            "ededed" "GitHub Actions workflows, container build, and release tooling"
ensure_label "area: observability" "f9d0c4" "OpenTelemetry, Prometheus, Loki, Tempo, and Grafana"
ensure_label "area: docs"          "0075ca" "Documentation and guides"
ensure_label "area: spec"          "bfd4f2" "Feature specs and acceptance criteria (docs/specs/)"
ensure_label "area: e2e"           "d4c5f9" "Playwright end-to-end tests (e2e/)"
ensure_label "security"            "b60205" "Security hardening, transport, or supply-chain protection"
ensure_label "release"             "0e8a16" "Release preparation and publishing"

echo "==> Labeling open M5 issues"
gh issue edit 1 --repo "$REPO" \
  --add-label "priority: p0,milestone: m5,security,area: server,area: shared" >/dev/null || true
gh issue edit 2 --repo "$REPO" \
  --add-label "priority: p1,milestone: m5,enhancement,area: web,area: shared,accessibility" >/dev/null || true

echo "==> Configuring main branch ruleset (PRs + required status checks, admin bypass retained)"
MAIN_RULESET_ID="$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name == "main") | .id' | head -n1)"
MAIN_PAYLOAD='{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "bypass_actors": [
    {
      "actor_id": 5,
      "actor_type": "RepositoryRole",
      "bypass_mode": "always"
    }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "check" },
          { "context": "e2e" },
          { "context": "container / test" },
          { "context": "observability" },
          { "context": "Dependency audit" },
          { "context": "Dependency review" },
          { "context": "CodeQL" },
          { "context": "Secret scan" },
          { "context": "PR title & hygiene" }
        ]
      }
    }
  ]
}'

if [ -n "$MAIN_RULESET_ID" ]; then
  gh api --method PUT "repos/$REPO/rulesets/$MAIN_RULESET_ID" --input - <<<"$MAIN_PAYLOAD" --silent
else
  gh api --method POST "repos/$REPO/rulesets" --input - <<<"$MAIN_PAYLOAD" --silent
fi

echo "==> Configuring release-tags ruleset (refs/tags/v*)"
TAG_RULESET_ID="$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name == "release-tags") | .id' | head -n1)"
TAG_PAYLOAD='{
  "name": "release-tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/tags/v*"],
      "exclude": []
    }
  },
  "bypass_actors": [
    {
      "actor_id": 5,
      "actor_type": "RepositoryRole",
      "bypass_mode": "always"
    }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ]
}'

if [ -n "$TAG_RULESET_ID" ]; then
  gh api --method PUT "repos/$REPO/rulesets/$TAG_RULESET_ID" --input - <<<"$TAG_PAYLOAD" --silent
else
  gh api --method POST "repos/$REPO/rulesets" --input - <<<"$TAG_PAYLOAD" --silent
fi

echo "Done."
