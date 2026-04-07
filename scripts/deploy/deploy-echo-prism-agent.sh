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
# YAML env file: avoids gcloud --set-env-vars breaking on commas/special chars in secrets.
DEPLOY_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/echo-agent-env.XXXXXX.yaml")"
trap 'rm -f "$AGENT_ENV_FILE"' EXIT
python3 "$DEPLOY_SCRIPT_DIR/agent_env_to_yaml.py" "$PROJECT_ID" >"$AGENT_ENV_FILE"

step "Deploying echo-prism-agent..."
echo ""

gcloud run deploy echo-prism-agent \
  --image "${IMAGE_BASE}/echo-prism-agent:${IMAGE_TAG}" \
  --region "$REGION" \
  --platform managed \
  --memory 4Gi \
  --cpu 2 \
  --cpu-boost \
  --no-cpu-throttling \
  --startup-probe=initialDelaySeconds=10,timeoutSeconds=5,periodSeconds=10,failureThreshold=60,tcpSocket.port=8080 \
  --env-vars-file="$AGENT_ENV_FILE" \
  --clear-secrets \
  --allow-unauthenticated \
  --project="$PROJECT_ID"

success "EchoPrism Agent deployed"
echo ""
echo -e "  ${LAVENDER}EchoPrism Agent:${R} $ECHO_PRISM_AGENT_URL"
echo ""
