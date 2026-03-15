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
  BUILD_SUBS="_IMAGE_TAG=$IMAGE_TAG,_BACKEND_URL=$BACKEND_URL,_AGENT_URL=$ECHO_PRISM_AGENT_URL"
  BUILD_SUBS="$BUILD_SUBS,_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY:-}"
  BUILD_SUBS="$BUILD_SUBS,_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:-}"
  BUILD_SUBS="$BUILD_SUBS,_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID:-}"
  BUILD_SUBS="$BUILD_SUBS,_FIREBASE_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:-}"
  BUILD_SUBS="$BUILD_SUBS,_FIREBASE_MESSAGING_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:-}"
  BUILD_SUBS="$BUILD_SUBS,_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID:-}"
  BUILD_SUBS="$BUILD_SUBS,_DESKTOP_DOWNLOAD_MAC_URL=${NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC_URL:-}"
  BUILD_SUBS="$BUILD_SUBS,_DESKTOP_DOWNLOAD_WIN_URL=${NEXT_PUBLIC_DESKTOP_DOWNLOAD_WIN_URL:-}"
  gcloud builds submit . \
    --config=scripts/deploy/cloudbuild.frontend.yaml \
    --project="$PROJECT_ID" \
    --substitutions="$BUILD_SUBS"
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
