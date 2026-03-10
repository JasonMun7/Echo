#!/usr/bin/env bash
# Deploy echo-frontend to Cloud Run
# Usage: ./scripts/deploy/deploy-frontend.sh [--build] [PROJECT_ID] [REGION]
#   --build  Build image first (omit when using deploy.sh which builds all)
set -e

source "$(dirname "$0")/common.sh"

BUILD_FIRST=
[ "$1" = "--build" ] && { BUILD_FIRST=1; shift; }
PROJECT_ID=${1:-$ECHO_GCP_PROJECT_ID}
REGION=${2:-${ECHO_CLOUD_RUN_REGION:-us-central1}}
load_config

if [ -n "$BUILD_FIRST" ]; then
  section "Build Frontend Image"
  step "Building echo-frontend with Cloud Build..."
  echo ""
  gcloud builds submit . \
    --config=scripts/deploy/cloudbuild.frontend.yaml \
    --project="$PROJECT_ID" \
    --substitutions="_IMAGE_TAG=$IMAGE_TAG,_BACKEND_URL=$BACKEND_URL"
  success "Frontend image built and pushed"
  echo ""
fi

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
