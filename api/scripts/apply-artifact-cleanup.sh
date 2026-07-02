#!/usr/bin/env bash
#
# Applies the Artifact Registry cleanup policy to the Cloud Run image repo.
#
# Every `gcloud run deploy` of api/ pushes a ~100 MB container image into the
# `cloud-run-source-deploy` repository. Old deploys never get removed on their
# own, so they pile up and accrue storage cost (~$0.10/GB/month). This policy:
#   - KEEPS the 5 most recent image versions (protects the live one + rollbacks)
#   - DELETES untagged images older than 30 days
# Keep rules always win over Delete rules, and the delete rule only targets
# UNTAGGED images, so the tagged `latest` image is doubly protected.
#
# Usage:
#   ./scripts/apply-artifact-cleanup.sh          # DRY RUN — shows what would be deleted, deletes nothing
#   ./scripts/apply-artifact-cleanup.sh --live   # actually enforce the policy
#
# Requires: gcloud CLI authenticated (`gcloud auth login`) with access to the
# amixos project.

set -euo pipefail

PROJECT="amixos"
LOCATION="us-central1"
REPO="cloud-run-source-deploy"
POLICY_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/artifact-cleanup-policy.json"

if [[ "${1:-}" == "--live" ]]; then
  DRY_RUN_FLAG="--no-dry-run"
  echo "⚠️  LIVE MODE — the policy will actually delete matching images."
else
  DRY_RUN_FLAG="--dry-run"
  echo "🔍 DRY RUN — nothing will be deleted. Re-run with --live to enforce."
fi

echo "Project:  $PROJECT"
echo "Repo:     $REPO ($LOCATION)"
echo "Policy:   $POLICY_FILE"
echo

gcloud artifacts repositories set-cleanup-policies "$REPO" \
  --project="$PROJECT" \
  --location="$LOCATION" \
  --policy="$POLICY_FILE" \
  "$DRY_RUN_FLAG"

echo
echo "Done. Inspect current policies with:"
echo "  gcloud artifacts repositories describe $REPO --project=$PROJECT --location=$LOCATION"
