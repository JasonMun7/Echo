#!/usr/bin/env bash
# Deploy echo-prism-agent to Cloud Run
# Usage: ./scripts/deploy/deploy-echo-prism-agent.sh [PROJECT_ID] [REGION]
# Requires: images built first (run build.sh or deploy.sh)
set -e

source "$(dirname "$0")/common.sh"

PROJECT_ID=${1:-$ECHO_GCP_PROJECT_ID}
REGION=${2:-${ECHO_CLOUD_RUN_REGION:-us-central1}}
load_config

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
