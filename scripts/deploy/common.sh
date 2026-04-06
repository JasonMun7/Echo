#!/usr/bin/env bash
# Shared config for Echo deployment scripts.
# Source with: source "$(dirname "$0")/common.sh"
# Or from repo root: source scripts/deploy/common.sh
set -e

# ------------------------------------------------------------------------------
# Design System Colors (ANSI 24-bit)
# ------------------------------------------------------------------------------
export R="\033[0m"
export BOLD="\033[1m"
# Primary (Design System)
export CETACEAN="\033[38;2;21;10;53m"     # #150A35 Primary Dark
export LAVENDER="\033[38;2;165;119;255m"  # #A577FF Primary Accent
export GHOST="\033[38;2;245;247;252m"     # #F5F7FC Surface
export CYAN="\033[38;2;33;196;221m"       # #21C4DD Secondary
# Semantic
export SUCCESS="\033[38;2;34;197;94m"
export ERROR="\033[38;2;239;68;68m"
export MUTED="\033[38;2;107;114;128m"

# ------------------------------------------------------------------------------
# Output helpers
# ------------------------------------------------------------------------------
section() {
  echo ""
  echo -e "${CETACEAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${R}"
  echo -e "${LAVENDER}  $1${R}"
  echo -e "${CETACEAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${R}"
  echo ""
}

step() {
  echo -e "${LAVENDER}→${R} $1"
}

success() {
  echo -e "${SUCCESS}✓${R} $1"
}

fail() {
  echo -e "${ERROR}✗${R} $1"
}

info() {
  echo -e "${MUTED}  $1${R}"
}

# ------------------------------------------------------------------------------
# Setup
# ------------------------------------------------------------------------------
DEPLOY_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DEPLOY_SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

# ------------------------------------------------------------------------------
# Configuration (call load_config after setting PROJECT_ID/REGION)
# ------------------------------------------------------------------------------
load_config() {
  PROJECT_ID=${PROJECT_ID:-$ECHO_GCP_PROJECT_ID}
  REGION=${REGION:-${ECHO_CLOUD_RUN_REGION:-us-central1}}
  IMAGE_TAG=${IMAGE_TAG:-latest}
  export PROJECT_ID REGION IMAGE_TAG PROJECT_NUMBER

  [ -z "$PROJECT_ID" ] && {
    fail "Missing PROJECT_ID"
    echo -e "Usage: ${MUTED}PROJECT_ID required (or set ECHO_GCP_PROJECT_ID)${R}"
    exit 1
  }

  PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)' 2>/dev/null) || {
    fail "Could not describe project $PROJECT_ID"
    exit 1
  }

  export BACKEND_URL="https://echo-backend-${PROJECT_NUMBER}.${REGION}.run.app"
  export FRONTEND_URL="https://echo-frontend-${PROJECT_NUMBER}.${REGION}.run.app"
  export ECHO_PRISM_AGENT_URL="https://echo-prism-agent-${PROJECT_NUMBER}.${REGION}.run.app"
  export OMNIPARSER_URL="https://echo-omniparser-${PROJECT_NUMBER}.${REGION}.run.app"
  export IMAGE_BASE="gcr.io/${PROJECT_ID}"
}

# Echo header (always shown when common.sh is sourced)
echo_header() {
  echo ""
  echo -e "${CETACEAN}${BOLD}"
  echo "  ███████╗ ██████╗██╗  ██╗ ██████╗ "
  echo "  ██╔════╝██╔════╝██║  ██║██╔═══██╗"
  echo "  █████╗  ██║     ███████║██║   ██║"
  echo "  ██╔══╝  ██║     ██╔══██║██║   ██║"
  echo "  ███████╗╚██████╗██║  ██║╚██████╔╝"
  echo "  ╚══════╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝ "
  echo -e "${R}"
}
echo_header
