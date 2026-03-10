#!/usr/bin/env bash
# Build and push the Echo agent image (Cloud Run Job)
# Usage: ./scripts/deploy-agent.sh [PROJECT_ID] [REGION]
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

source "$SCRIPT_DIR/deploy/_common.sh"
resolve_config "$1" "$2"
print_banner
print_config

# -- Build --
section "Build Agent Image"
step "Building echo-agent with Cloud Build..."
echo ""

gcloud builds submit . \
  --config=scripts/deploy/cloudbuild.agent.yaml \
  --project="$PROJECT_ID" \
  --substitutions="_IMAGE_TAG=$IMAGE_TAG"

success "Agent image built and pushed"
echo ""

# -- Update Cloud Run Job --
section "Update Agent Job"
step "Updating echo-agent Cloud Run job..."
echo ""

gcloud run jobs update echo-agent \
  --image "${IMAGE_BASE}/echo-agent:${IMAGE_TAG}" \
  --region "$REGION" \
  --project="$PROJECT_ID" \
  2>/dev/null || {
    step "Job doesn't exist yet, creating..."
    gcloud run jobs create echo-agent \
      --image "${IMAGE_BASE}/echo-agent:${IMAGE_TAG}" \
      --region "$REGION" \
      --cpu 2 \
      --memory 2Gi \
      --max-retries 0 \
      --task-count 1 \
      --project="$PROJECT_ID"
  }

success "Agent job updated"
echo ""
echo -e "  ${LAVENDER}Agent image:${R}  ${IMAGE_BASE}/echo-agent:${IMAGE_TAG}"
echo ""
