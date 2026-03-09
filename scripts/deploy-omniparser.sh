#!/usr/bin/env bash
# Deploy only the Echo OmniParser GPU service to Cloud Run
# Usage: ./scripts/deploy-omniparser.sh [PROJECT_ID] [REGION]
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

source "$SCRIPT_DIR/deploy/_common.sh"
resolve_config "$1" "$2"
print_banner
print_config

# -- Build --
section "Build OmniParser Image"
step "Building echo-omniparser with Cloud Build..."
echo ""

gcloud builds submit . \
  --config=scripts/deploy/cloudbuild.omniparser.yaml \
  --project="$PROJECT_ID" \
  --substitutions="_IMAGE_TAG=$IMAGE_TAG"

success "OmniParser image built and pushed"
echo ""

# -- Deploy --
section "Deploy OmniParser (GPU)"
step "Deploying echo-omniparser GPU service to Cloud Run..."
echo ""

gcloud run deploy echo-omniparser \
  --image "${IMAGE_BASE}/echo-omniparser:${IMAGE_TAG}" \
  --region "$REGION" \
  --platform managed \
  --no-allow-unauthenticated \
  --gpu=1 \
  --gpu-type=nvidia-l4 \
  --cpu 4 \
  --memory 16Gi \
  --min-instances 1 \
  --max-instances 3 \
  --concurrency 4 \
  --set-env-vars "BOX_TRESHOLD=0.05,CAPTION_MODEL_NAME=florence2" \
  --project="$PROJECT_ID"

# Allow backend / agent to invoke OmniParser (service-to-service auth)
BACKEND_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud run services add-iam-policy-binding echo-omniparser \
  --region "$REGION" \
  --member="serviceAccount:${BACKEND_SA}" \
  --role="roles/run.invoker" \
  --project="$PROJECT_ID" \
  --quiet 2>/dev/null || true

success "OmniParser GPU service deployed"
echo ""
echo -e "  ${LAVENDER}OmniParser:${R}  $OMNIPARSER_URL"
echo ""
