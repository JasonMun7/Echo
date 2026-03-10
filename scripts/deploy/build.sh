#!/usr/bin/env bash
# Build and push all Echo images via Cloud Build
# Usage: ./scripts/deploy/build.sh [PROJECT_ID] [REGION]
set -e

source "$(dirname "$0")/common.sh"

PROJECT_ID=${1:-$ECHO_GCP_PROJECT_ID}
REGION=${2:-${ECHO_CLOUD_RUN_REGION:-us-central1}}
load_config

section "Build & Push Images"
step "Uploading source and building with Cloud Build (parallel, linux/amd64)..."
echo ""

gcloud builds submit . \
  --config=scripts/deploy/cloudbuild.yaml \
  --project="$PROJECT_ID" \
  --substitutions="_IMAGE_TAG=$IMAGE_TAG,_BACKEND_URL=$BACKEND_URL,_AGENT_URL=$ECHO_PRISM_AGENT_URL"

success "Images built and pushed to gcr.io/$PROJECT_ID"
echo ""
