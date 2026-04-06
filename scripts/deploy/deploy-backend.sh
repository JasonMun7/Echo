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
BACKEND_ENV="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,ECHO_GCP_PROJECT_ID=$PROJECT_ID,CLOUD_RUN_REGION=$REGION,FRONTEND_ORIGIN=$FRONTEND_URL,ECHOPRISM_OMNIPARSER_URL=$OMNIPARSER_URL"
[ -n "$ECHO_GCS_BUCKET" ]    && BACKEND_ENV="$BACKEND_ENV,ECHO_GCS_BUCKET=$ECHO_GCS_BUCKET"
[ -n "$GEMINI_API_KEY" ]     && BACKEND_ENV="$BACKEND_ENV,GEMINI_API_KEY=$GEMINI_API_KEY"

step "Deploying echo-backend..."
echo ""

gcloud run deploy echo-backend \
  --image "${IMAGE_BASE}/echo-backend:${IMAGE_TAG}" \
  --region "$REGION" \
  --platform managed \
  --set-env-vars "$BACKEND_ENV" \
  --clear-secrets \
  --allow-unauthenticated \
  --project="$PROJECT_ID"

success "Backend deployed"
echo ""
echo -e "  ${LAVENDER}Backend:${R} $BACKEND_URL"
echo ""
