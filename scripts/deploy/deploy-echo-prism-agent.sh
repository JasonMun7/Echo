#!/usr/bin/env bash
# Deploy echo-prism-agent to Cloud Run
# Usage: ./scripts/deploy/deploy-echo-prism-agent.sh [--build] [PROJECT_ID] [REGION]
#   --build  Build image first (omit when using deploy.sh which builds all)
set -e

source "$(dirname "$0")/common.sh"

BUILD_FIRST=
[ "$1" = "--build" ] && { BUILD_FIRST=1; shift; }
PROJECT_ID=${1:-$ECHO_GCP_PROJECT_ID}
REGION=${2:-${ECHO_CLOUD_RUN_REGION:-us-central1}}
load_config

if [ -n "$BUILD_FIRST" ]; then
  section "Build EchoPrism Agent Image"
  step "Building echo-prism-agent with Cloud Build..."
  echo ""
  gcloud builds submit . \
    --config=scripts/deploy/cloudbuild.echo-prism-agent.yaml \
    --project="$PROJECT_ID" \
    --substitutions="_IMAGE_TAG=$IMAGE_TAG"
  success "EchoPrism Agent image built and pushed"
  echo ""
fi

section "Deploy EchoPrism Agent"
AGENT_ENV="GEMINI_API_KEY=$GEMINI_API_KEY,ECHOPRISM_OMNIPARSER_URL=$OMNIPARSER_URL,FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID,GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
[ -n "$ECHO_GCS_BUCKET" ]    && AGENT_ENV="$AGENT_ENV,ECHO_GCS_BUCKET=$ECHO_GCS_BUCKET"
[ -n "$FIREBASE_PROJECT_ID" ] && AGENT_ENV="$AGENT_ENV,FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID"
[ -n "$GEMINI_API_KEY" ]     && AGENT_ENV="$AGENT_ENV,GEMINI_API_KEY=$GEMINI_API_KEY"

step "Deploying echo-prism-agent..."
echo ""

gcloud run deploy echo-prism-agent \
  --image "${IMAGE_BASE}/echo-prism-agent:${IMAGE_TAG}" \
  --region "$REGION" \
  --platform managed \
  --set-env-vars "$AGENT_ENV" \
  --clear-secrets \
  --allow-unauthenticated \
  --project="$PROJECT_ID"

success "EchoPrism Agent deployed"
echo ""
echo -e "  ${LAVENDER}EchoPrism Agent:${R} $ECHO_PRISM_AGENT_URL"
echo ""
