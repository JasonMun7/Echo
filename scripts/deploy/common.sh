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
  export IMAGE_BASE="gcr.io/${PROJECT_ID}"
}

# Comma-separated gcloud --substitutions for Cloud Build frontend images.
# Call after load_config. Reads NEXT_PUBLIC_* from the environment (e.g. Doppler prd).
echo_frontend_cloudbuild_substitutions() {
  local missing=()
  [ -z "${IMAGE_TAG:-}" ] && missing+=("IMAGE_TAG")
  [ -z "${BACKEND_URL:-}" ] && missing+=("BACKEND_URL")
  [ -z "${ECHO_PRISM_AGENT_URL:-}" ] && missing+=("ECHO_PRISM_AGENT_URL")
  [ -z "${NEXT_PUBLIC_FIREBASE_API_KEY:-}" ] && missing+=("NEXT_PUBLIC_FIREBASE_API_KEY")
  [ -z "${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:-}" ] && missing+=("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN")
  [ -z "${NEXT_PUBLIC_FIREBASE_PROJECT_ID:-}" ] && missing+=("NEXT_PUBLIC_FIREBASE_PROJECT_ID")
  [ -z "${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:-}" ] && missing+=("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET")
  [ -z "${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:-}" ] && missing+=("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID")
  [ -z "${NEXT_PUBLIC_FIREBASE_APP_ID:-}" ] && missing+=("NEXT_PUBLIC_FIREBASE_APP_ID")
  [ -z "${NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC_URL:-}" ] && missing+=("NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC_URL")
  [ -z "${NEXT_PUBLIC_DESKTOP_DOWNLOAD_WIN_URL:-}" ] && missing+=("NEXT_PUBLIC_DESKTOP_DOWNLOAD_WIN_URL")
  if [ "${#missing[@]}" -ne 0 ]; then
    echo "ERROR: Missing required environment variables for frontend Cloud Build substitutions:" >&2
    printf '  - %s\n' "${missing[@]}" >&2
    exit 1
  fi
  local bf="${NEXT_PUBLIC_BRANDFETCH_CLIENT_ID:-}"
  echo "_IMAGE_TAG=$IMAGE_TAG,_BACKEND_URL=$BACKEND_URL,_AGENT_URL=$ECHO_PRISM_AGENT_URL,_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY,_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID,_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID,_DESKTOP_DOWNLOAD_MAC_URL=$NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC_URL,_DESKTOP_DOWNLOAD_WIN_URL=$NEXT_PUBLIC_DESKTOP_DOWNLOAD_WIN_URL,_BRANDFETCH_CLIENT_ID=$bf"
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
