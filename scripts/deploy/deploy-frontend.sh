#!/usr/bin/env bash
# Deploy echo-frontend to Cloud Run
# Usage: ./scripts/deploy/deploy-frontend.sh [PROJECT_ID] [REGION]
# Requires: images built first (run build.sh or deploy.sh)
set -e

source "$(dirname "$0")/common.sh"

PROJECT_ID=${1:-$ECHO_GCP_PROJECT_ID}
REGION=${2:-${ECHO_CLOUD_RUN_REGION:-us-central1}}
load_config

section "Deploy Frontend"
step "Deploying echo-frontend..."
echo ""

gcloud run deploy echo-frontend \
  --image "${IMAGE_BASE}/echo-frontend:${IMAGE_TAG}" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --cpu-boost \
  --project="$PROJECT_ID"

success "Frontend deployed"
echo ""
echo -e "  ${LAVENDER}Frontend:${R} $FRONTEND_URL"
echo ""
