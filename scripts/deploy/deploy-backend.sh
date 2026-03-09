#!/usr/bin/env bash
# Deploy echo-backend to Cloud Run
# Usage: ./scripts/deploy/deploy-backend.sh [PROJECT_ID] [REGION]
# Requires: images built first (run build.sh or deploy.sh)
set -e

source "$(dirname "$0")/common.sh"

PROJECT_ID=${1:-$ECHO_GCP_PROJECT_ID}
REGION=${2:-${ECHO_CLOUD_RUN_REGION:-us-central1}}
load_config

section "Deploy Backend"
BACKEND_ENV="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,CLOUD_RUN_REGION=$REGION,FRONTEND_ORIGIN=$FRONTEND_URL"
[ -n "$ECHO_GCS_BUCKET" ]    && BACKEND_ENV="$BACKEND_ENV,ECHO_GCS_BUCKET=$ECHO_GCS_BUCKET"
[ -n "$FIREBASE_PROJECT_ID" ] && BACKEND_ENV="$BACKEND_ENV,FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID"
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
