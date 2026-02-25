#!/usr/bin/env bash
# Echo deployment script for Cloud Run
# Uses Cloud Build for parallel image builds (no local Docker required)
#
# Usage: ./scripts/deploy.sh [PROJECT_ID] [REGION]
# Or set ECHO_GCP_PROJECT_ID, ECHO_CLOUD_RUN_REGION (via Doppler prd) and run: npm run deploy
set -e

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
# Setup
# ------------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------
PROJECT_ID=${1:-$ECHO_GCP_PROJECT_ID}
REGION=${2:-${ECHO_CLOUD_RUN_REGION:-us-central1}}
IMAGE_TAG=${IMAGE_TAG:-latest}

[ -z "$PROJECT_ID" ] && {
  fail "Missing PROJECT_ID"
  echo -e "Usage: ${MUTED}./scripts/deploy.sh PROJECT_ID [REGION]${R}"
  echo -e "       ${MUTED}Or set ECHO_GCP_PROJECT_ID via Doppler prd${R}"
  exit 1
}

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)' 2>/dev/null) || {
  fail "Could not describe project $PROJECT_ID"
  exit 1
}

BACKEND_URL="https://echo-backend-${PROJECT_NUMBER}.${REGION}.run.app"
FRONTEND_URL="https://echo-frontend-${PROJECT_NUMBER}.${REGION}.run.app"
IMAGE_BASE="gcr.io/${PROJECT_ID}"

# ------------------------------------------------------------------------------
# Header
# ------------------------------------------------------------------------------
echo ""
echo -e "${CETACEAN}${BOLD}"
echo "  ███████╗ ██████╗██╗  ██╗ ██████╗ "
echo "  ██╔════╝██╔════╝██║  ██║██╔═══██╗"
echo "  █████╗  ██║     ███████║██║   ██║"
echo "  ██╔══╝  ██║     ██╔══██║██║   ██║"
echo "  ███████╗╚██████╗██║  ██║╚██████╔╝"
echo "  ╚══════╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝ "
echo -e "${R}"
section "Configuration"
echo -e "  ${MUTED}Project:${R}  ${BOLD}$PROJECT_ID${R}"
echo -e "  ${MUTED}Region:${R}   $REGION"
echo -e "  ${MUTED}Backend:${R}  $BACKEND_URL"
echo ""

# ------------------------------------------------------------------------------
# Build & push images (Cloud Build)
# ------------------------------------------------------------------------------
section "Step 1/4 — Build & Push Images"
step "Uploading source and building with Cloud Build (parallel, linux/amd64)..."
echo ""

gcloud builds submit . \
  --config=scripts/deploy/cloudbuild.yaml \
  --project="$PROJECT_ID" \
  --substitutions="_IMAGE_TAG=$IMAGE_TAG,_BACKEND_URL=$BACKEND_URL"

success "Images built and pushed to gcr.io/$PROJECT_ID"
echo ""

# ------------------------------------------------------------------------------
# Deploy Cloud Run services
# ------------------------------------------------------------------------------
section "Step 2/4 — Deploy Frontend"
step "Deploying echo-frontend..."
echo ""
gcloud run deploy echo-frontend \
  --image "${IMAGE_BASE}/echo-frontend:${IMAGE_TAG}" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --project="$PROJECT_ID"
success "Frontend deployed"
echo ""

section "Step 3/4 — Deploy Backend"
BACKEND_ENV="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,CLOUD_RUN_REGION=$REGION,RUN_JOB_NAME=echo-agent,FRONTEND_ORIGIN=$FRONTEND_URL"
[ -n "$ECHO_GCS_BUCKET" ]    && BACKEND_ENV="$BACKEND_ENV,ECHO_GCS_BUCKET=$ECHO_GCS_BUCKET"
[ -n "$FIREBASE_PROJECT_ID" ] && BACKEND_ENV="$BACKEND_ENV,FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID"
[ -n "$GEMINI_API_KEY" ]     && BACKEND_ENV="$BACKEND_ENV,GEMINI_API_KEY=$GEMINI_API_KEY"

step "Deploying echo-backend..."
echo ""
gcloud run deploy echo-backend \
  --image "${IMAGE_BASE}/echo-backend:${IMAGE_TAG}" \
  --region "$REGION" \
  --platform managed \
  --set-env-vars "$BACKEND_ENV" \
  --clear-secrets \
  --allow-unauthenticated \
  --project="$PROJECT_ID"
success "Backend deployed"
echo ""

section "Step 4/4 — Deploy Agent Job"
AGENT_ENV="HEADLESS=true"
[ -n "$ECHO_GCS_BUCKET" ]    && AGENT_ENV="$AGENT_ENV,ECHO_GCS_BUCKET=$ECHO_GCS_BUCKET"
[ -n "$FIREBASE_PROJECT_ID" ] && AGENT_ENV="$AGENT_ENV,FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID"
[ -n "$GEMINI_API_KEY" ]     && AGENT_ENV="$AGENT_ENV,GEMINI_API_KEY=$GEMINI_API_KEY"

step "Deploying echo-agent job..."
echo ""
gcloud run jobs deploy echo-agent \
  --image "${IMAGE_BASE}/echo-agent:${IMAGE_TAG}" \
  --region "$REGION" \
  --set-env-vars "$AGENT_ENV" \
  --clear-secrets \
  --memory 2Gi \
  --cpu 2 \
  --max-retries 0 \
  --project="$PROJECT_ID"

BACKEND_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud run jobs add-iam-policy-binding echo-agent \
  --region "$REGION" \
  --member="serviceAccount:${BACKEND_SA}" \
  --role="roles/run.invoker" \
  --project="$PROJECT_ID" \
  --quiet 2>/dev/null || true

success "Agent job deployed"
echo ""

# ------------------------------------------------------------------------------
# Done
# ------------------------------------------------------------------------------
section "Deployment Complete"
echo -e "  ${SUCCESS}${BOLD}All services deployed successfully!${R}"
echo ""
echo -e "  ${LAVENDER}Frontend:${R}  $FRONTEND_URL"
echo -e "  ${LAVENDER}Backend:${R}   $BACKEND_URL"
echo ""
echo -e "  ${MUTED}If you see 500 errors: ensure Firebase and GCP use the same project.${R}"
echo ""
