#!/usr/bin/env bash
# Deploy echo-omniparser (GPU service) to Cloud Run
# Usage: ./scripts/deploy/deploy-omniparser.sh [--build] [PROJECT_ID] [REGION]
#   --build  Build image first (omit when using deploy.sh which builds all)
set -e

source "$(dirname "$0")/common.sh"

BUILD_FIRST=
[ "$1" = "--build" ] && { BUILD_FIRST=1; shift; }
PROJECT_ID=${1:-$ECHO_GCP_PROJECT_ID}
REGION=${2:-${ECHO_OMNIPARSER_REGION:-us-east4}}
load_config

if [ -n "$BUILD_FIRST" ]; then
  section "Build OmniParser Image"
  step "Building echo-omniparser with Cloud Build..."
  echo ""
  gcloud builds submit OmniParser \
    --config=scripts/deploy/cloudbuild.omniparser.yaml \
    --project="$PROJECT_ID" \
    --substitutions="_IMAGE_TAG=$IMAGE_TAG"
  success "OmniParser image built and pushed"
  echo ""
fi

section "Deploy OmniParser (GPU)"
step "Deploying echo-omniparser GPU service..."
echo ""

gcloud run deploy echo-omniparser \
  --image "${IMAGE_BASE}/echo-omniparser:${IMAGE_TAG}" \
  --region "$REGION" \
  --platform managed \
  --no-allow-unauthenticated \
  --gpu=1 \
  --gpu-type=nvidia-l4 \
  --no-gpu-zonal-redundancy \
  --cpu 4 \
  --memory 16Gi \
  --min-instances 1 \
  --max-instances 1 \
  --concurrency 1 \
  --timeout 60 \
  --cpu-boost \
  --set-env-vars "BOX_TRESHOLD=0.05,CAPTION_MODEL_NAME=florence2" \
  --project="$PROJECT_ID"

# Allow backend and echo-prism-agent to invoke OmniParser (service-to-service auth)
BACKEND_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud run services add-iam-policy-binding echo-omniparser \
  --region "$REGION" \
  --member="serviceAccount:${BACKEND_SA}" \
  --role="roles/run.invoker" \
  --project="$PROJECT_ID" \
  --quiet 2>/dev/null || true

success "OmniParser GPU service deployed"
echo ""
echo -e "  ${LAVENDER}OmniParser:${R} $OMNIPARSER_URL"
echo ""
