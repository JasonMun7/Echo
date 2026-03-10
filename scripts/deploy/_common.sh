#!/usr/bin/env bash
# Shared helpers for Echo deploy scripts
# Source this from individual deploy scripts:
#   source "$(dirname "${BASH_SOURCE[0]}")/deploy/_common.sh"

# ------------------------------------------------------------------------------
# Design System Colors (ANSI 24-bit)
# ------------------------------------------------------------------------------
R="\033[0m"
BOLD="\033[1m"
CETACEAN="\033[38;2;21;10;53m"
LAVENDER="\033[38;2;165;119;255m"
GHOST="\033[38;2;245;247;252m"
SUCCESS="\033[38;2;34;197;94m"
ERROR="\033[38;2;239;68;68m"
MUTED="\033[38;2;107;114;128m"

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

info() {
  echo -e "${MUTED}  $1${R}"
}

fail() {
  echo -e "${ERROR}✗${R} $1"
}

# ------------------------------------------------------------------------------
# Resolve configuration
# Sets: PROJECT_ID, REGION, IMAGE_TAG, PROJECT_NUMBER,
#       BACKEND_URL, FRONTEND_URL, OMNIPARSER_URL, IMAGE_BASE
# ------------------------------------------------------------------------------
resolve_config() {
  PROJECT_ID=${1:-$ECHO_GCP_PROJECT_ID}
  REGION=${2:-${ECHO_CLOUD_RUN_REGION:-us-central1}}
  IMAGE_TAG=${IMAGE_TAG:-latest}

  [ -z "$PROJECT_ID" ] && {
    fail "Missing PROJECT_ID"
    echo -e "Usage: ${MUTED}$0 PROJECT_ID [REGION]${R}"
    echo -e "       ${MUTED}Or set ECHO_GCP_PROJECT_ID via Doppler prd${R}"
    exit 1
  }

  PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)' 2>/dev/null) || {
    fail "Could not describe project $PROJECT_ID"
    exit 1
  }

  BACKEND_URL="https://echo-backend-${PROJECT_NUMBER}.${REGION}.run.app"
  FRONTEND_URL="https://echo-frontend-${PROJECT_NUMBER}.${REGION}.run.app"
  OMNIPARSER_URL="https://echo-omniparser-${PROJECT_NUMBER}.${REGION}.run.app"
  IMAGE_BASE="gcr.io/${PROJECT_ID}"
}

# Print the echo ASCII banner
print_banner() {
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

# Print resolved configuration
print_config() {
  section "Configuration"
  echo -e "  ${MUTED}Project:${R}    ${BOLD}$PROJECT_ID${R}"
  echo -e "  ${MUTED}Region:${R}     $REGION"
  echo -e "  ${MUTED}Image tag:${R}  $IMAGE_TAG"
  echo ""
}
