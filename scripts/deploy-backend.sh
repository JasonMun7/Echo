#!/usr/bin/env bash
# Deploy only the Echo backend to Cloud Run
# Usage: ./scripts/deploy-backend.sh [PROJECT_ID] [REGION]
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

source "$SCRIPT_DIR/deploy/_common.sh"
resolve_config "$1" "$2"
print_banner
print_config

# -- Build --
section "Build Backend Image"
step "Building echo-backend with Cloud Build..."
echo ""

gcloud builds submit . \
  --config=scripts/deploy/cloudbuild.backend.yaml \
  --project="$PROJECT_ID" \
  --substitutions="_IMAGE_TAG=$IMAGE_TAG"

success "Backend image built and pushed"
echo ""

# -- Deploy --
section "Deploy Backend"

BACKEND_ENV="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,CLOUD_RUN_REGION=$REGION,RUN_JOB_NAME=echo-agent,FRONTEND_ORIGIN=$FRONTEND_URL,ECHOPRISM_OMNIPARSER_URL=$OMNIPARSER_URL"
[ -n "$ECHO_GCS_BUCKET" ]    && BACKEND_ENV="$BACKEND_ENV,ECHO_GCS_BUCKET=$ECHO_GCS_BUCKET"
[ -n "$FIREBASE_PROJECT_ID" ] && BACKEND_ENV="$BACKEND_ENV,FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID"
[ -n "$GEMINI_API_KEY" ]     && BACKEND_ENV="$BACKEND_ENV,GEMINI_API_KEY=$GEMINI_API_KEY"

step "Deploying echo-backend to Cloud Run..."
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
echo -e "  ${LAVENDER}Backend:${R}  $BACKEND_URL"
echo ""
