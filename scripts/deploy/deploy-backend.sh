#!/usr/bin/env bash
# Deploy echo-backend to Cloud Run
# Usage: ./scripts/deploy/deploy-backend.sh [--build] [PROJECT_ID] [REGION]
#   --build  Build image first (omit when using deploy.sh which builds all)
set -e

source "$(dirname "$0")/common.sh"

BUILD_FIRST=
[ "$1" = "--build" ] && { BUILD_FIRST=1; shift; }
PROJECT_ID=${1:-$ECHO_GCP_PROJECT_ID}
REGION=${2:-${ECHO_CLOUD_RUN_REGION:-us-central1}}
load_config

if [ -n "$BUILD_FIRST" ]; then
  section "Build Backend Image"
  step "Building echo-backend with Cloud Build..."
  echo ""
  gcloud builds submit . \
    --config=scripts/deploy/cloudbuild.backend.yaml \
    --project="$PROJECT_ID" \
    --substitutions="_IMAGE_TAG=$IMAGE_TAG"
  success "Backend image built and pushed"
  echo ""
fi

section "Deploy Backend"
# YAML env file: avoids gcloud --set-env-vars breaking on commas/special chars in Auth0 secrets.
DEPLOY_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/echo-backend-env.yaml.XXXXXX")"
trap 'rm -f "$BACKEND_ENV_FILE"' EXIT
python3 "$DEPLOY_SCRIPT_DIR/backend_env_to_yaml.py" "$PROJECT_ID" "$REGION" >"$BACKEND_ENV_FILE"

step "Deploying echo-backend..."
echo ""

gcloud run deploy echo-backend \
  --image "${IMAGE_BASE}/echo-backend:${IMAGE_TAG}" \
  --region "$REGION" \
  --platform managed \
  --env-vars-file="$BACKEND_ENV_FILE" \
  --clear-secrets \
  --allow-unauthenticated \
  --project="$PROJECT_ID"

success "Backend deployed"
echo ""
echo -e "  ${LAVENDER}Backend:${R} $BACKEND_URL"
echo ""
