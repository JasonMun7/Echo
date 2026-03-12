#!/usr/bin/env bash
# Deploy echo-prism-livekit-agent to Cloud Run
# Long-running worker that connects to LiveKit Cloud and joins rooms for voice
# Usage: ./scripts/deploy/deploy-livekit-agent.sh [--build] [PROJECT_ID] [REGION]
#   --build  Build image first (omit when using deploy.sh which builds all)
set -e

source "$(dirname "$0")/common.sh"

BUILD_FIRST=
[ "$1" = "--build" ] && { BUILD_FIRST=1; shift; }
PROJECT_ID=${1:-$ECHO_GCP_PROJECT_ID}
REGION=${2:-${ECHO_CLOUD_RUN_REGION:-us-central1}}
load_config

if [ -n "$BUILD_FIRST" ]; then
  section "Build LiveKit Agent Image"
  step "Building echo-prism-livekit-agent with Cloud Build..."
  echo ""
  gcloud builds submit . \
    --config=scripts/deploy/cloudbuild.livekit-agent.yaml \
    --project="$PROJECT_ID" \
    --substitutions="_IMAGE_TAG=$IMAGE_TAG"
  success "LiveKit Agent image built and pushed"
  echo ""
fi

section "Deploy LiveKit Agent"
# Required: LiveKit credentials, EchoPrism Agent URL (for /api/agent/tool), GEMINI for voice model
LIVEKIT_ENV="LIVEKIT_URL=$LIVEKIT_URL,LIVEKIT_API_KEY=$LIVEKIT_API_KEY,LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET,LIVEKIT_AGENT_SECRET=$LIVEKIT_AGENT_SECRET,ECHOPRISM_AGENT_URL=$ECHO_PRISM_AGENT_URL,GEMINI_API_KEY=$GEMINI_API_KEY"
[ -n "$ECHOPRISM_VOICE_MODEL" ] && LIVEKIT_ENV="$LIVEKIT_ENV,ECHOPRISM_VOICE_MODEL=$ECHOPRISM_VOICE_MODEL"
[ -n "$ECHOPRISM_VOICE" ]       && LIVEKIT_ENV="$LIVEKIT_ENV,ECHOPRISM_VOICE=$ECHOPRISM_VOICE"

step "Deploying echo-prism-livekit-agent (min-instances=1 to stay connected)..."
echo ""

gcloud run deploy echo-prism-livekit-agent \
  --image "${IMAGE_BASE}/echo-prism-livekit-agent:${IMAGE_TAG}" \
  --region "$REGION" \
  --platform managed \
  --set-env-vars "$LIVEKIT_ENV" \
  --min-instances 1 \
  --max-instances 3 \
  --cpu 1 \
  --memory 1Gi \
  --no-cpu-throttling \
  --allow-unauthenticated \
  --project="$PROJECT_ID"

success "LiveKit Agent deployed"
echo ""
echo -e "  ${LAVENDER}LiveKit Agent:${R} echo-prism-livekit-agent (connects to LiveKit Cloud)"
echo ""
