#!/usr/bin/env bash
# Deploy only the Echo frontend to Cloud Run
# Usage: ./scripts/deploy-frontend.sh [PROJECT_ID] [REGION]
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

source "$SCRIPT_DIR/deploy/_common.sh"
resolve_config "$1" "$2"
print_banner
print_config

# -- Build --
section "Build Frontend Image"
step "Building echo-frontend with Cloud Build..."
echo ""

gcloud builds submit . \
  --config=scripts/deploy/cloudbuild.frontend.yaml \
  --project="$PROJECT_ID" \
  --substitutions="_IMAGE_TAG=$IMAGE_TAG,_BACKEND_URL=$BACKEND_URL"

success "Frontend image built and pushed"
echo ""

# -- Deploy --
section "Deploy Frontend"
step "Deploying echo-frontend to Cloud Run..."
echo ""

gcloud run deploy echo-frontend \
  --image "${IMAGE_BASE}/echo-frontend:${IMAGE_TAG}" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --project="$PROJECT_ID"

success "Frontend deployed"
echo ""
echo -e "  ${LAVENDER}Frontend:${R}  $FRONTEND_URL"
echo ""
