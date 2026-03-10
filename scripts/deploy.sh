#!/usr/bin/env bash
# Echo full deployment — build all images, then deploy all services
# Uses Cloud Build for parallel image builds (no local Docker required)
#
# Usage: ./scripts/deploy.sh [PROJECT_ID] [REGION]
# Or set ECHO_GCP_PROJECT_ID, ECHO_CLOUD_RUN_REGION (via Doppler prd) and run: npm run deploy
#
# To deploy only specific services (each builds its image first):
#   ./scripts/deploy/deploy-frontend.sh --build [PROJECT_ID] [REGION]
#   ./scripts/deploy/deploy-backend.sh --build [PROJECT_ID] [REGION]
#   ./scripts/deploy/deploy-echo-prism-agent.sh --build [PROJECT_ID] [REGION]
#   ./scripts/deploy/deploy-omniparser.sh --build [PROJECT_ID] [REGION]
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy/common.sh"

PROJECT_ID=${1:-$ECHO_GCP_PROJECT_ID}
REGION=${2:-${ECHO_CLOUD_RUN_REGION:-us-central1}}
load_config

# ------------------------------------------------------------------------------
# Header
# ------------------------------------------------------------------------------
echo_header
section "Configuration"
echo -e "  ${MUTED}Project:${R}  ${BOLD}$PROJECT_ID${R}"
echo -e "  ${MUTED}Region:${R}   $REGION"
echo -e "  ${MUTED}Backend:${R}  $BACKEND_URL"
echo -e "  ${MUTED}EchoPrism Agent:${R} $ECHO_PRISM_AGENT_URL"
echo -e "  ${MUTED}OmniParser:${R} $OMNIPARSER_URL"
echo ""

# ------------------------------------------------------------------------------
# Build
# ------------------------------------------------------------------------------
"$SCRIPT_DIR/deploy/build.sh" "$PROJECT_ID" "$REGION"

# ------------------------------------------------------------------------------
# Deploy all services
# ------------------------------------------------------------------------------
"$SCRIPT_DIR/deploy/deploy-frontend.sh" "$PROJECT_ID" "$REGION"
"$SCRIPT_DIR/deploy/deploy-backend.sh" "$PROJECT_ID" "$REGION"
"$SCRIPT_DIR/deploy/deploy-echo-prism-agent.sh" "$PROJECT_ID" "$REGION"
"$SCRIPT_DIR/deploy/deploy-omniparser.sh" "$PROJECT_ID" "$REGION"

# ------------------------------------------------------------------------------
# Done
# ------------------------------------------------------------------------------
section "Deployment Complete"
echo -e "  ${SUCCESS}${BOLD}All services deployed successfully!${R}"
echo ""
echo -e "  ${LAVENDER}Frontend:${R}  $FRONTEND_URL"
echo -e "  ${LAVENDER}Backend:${R}   $BACKEND_URL"
echo -e "  ${LAVENDER}EchoPrism Agent:${R} $ECHO_PRISM_AGENT_URL"
echo -e "  ${LAVENDER}OmniParser:${R} $OMNIPARSER_URL"
echo ""
echo -e "  ${MUTED}If you see 500 errors: ensure Firebase and GCP use the same project.${R}"
echo ""
