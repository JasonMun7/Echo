#!/usr/bin/env bash
# Echo deployment script for Cloud Run
# Usage: ./deploy.sh [PROJECT_ID] [REGION]
# Or set ECHO_GCP_PROJECT_ID, ECHO_CLOUD_RUN_REGION in backend/.env and run: npm run deploy
set -e

PROJECT_ID=${1:-$ECHO_GCP_PROJECT_ID}
REGION=${2:-${ECHO_CLOUD_RUN_REGION:-us-central1}}
[ -z "$PROJECT_ID" ] && { echo "Usage: ./deploy.sh PROJECT_ID [REGION] or set ECHO_GCP_PROJECT_ID in backend/.env"; exit 1; }
IMAGE_TAG=${IMAGE_TAG:-latest}

# Cloud Run requires linux/amd64; building on ARM Mac uses emulation (slower but works)
PLATFORM="linux/amd64"

PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
BACKEND_URL="https://echo-backend-${PROJECT_NUMBER}.${REGION}.run.app"
echo "Deploying Echo to project $PROJECT_ID, region $REGION"
echo "Building for $PLATFORM (required by Cloud Run)..."
echo "Frontend will use backend URL: $BACKEND_URL"

# Build and push images (--provenance=false avoids OCI index manifest issues on Cloud Run)
echo "Building frontend..."
docker build --platform $PLATFORM --provenance=false --build-arg NEXT_PUBLIC_API_URL=$BACKEND_URL -t gcr.io/$PROJECT_ID/echo-frontend:$IMAGE_TAG ./frontend
docker push gcr.io/$PROJECT_ID/echo-frontend:$IMAGE_TAG

echo "Building backend..."
docker build --platform $PLATFORM --provenance=false -t gcr.io/$PROJECT_ID/echo-backend:$IMAGE_TAG ./backend
docker push gcr.io/$PROJECT_ID/echo-backend:$IMAGE_TAG

echo "Building agent..."
docker build --platform $PLATFORM --provenance=false -f backend/agent/Dockerfile -t gcr.io/$PROJECT_ID/echo-agent:$IMAGE_TAG backend/agent
docker push gcr.io/$PROJECT_ID/echo-agent:$IMAGE_TAG

# Deploy services
echo "Deploying Cloud Run services..."
gcloud run deploy echo-frontend \
  --image gcr.io/$PROJECT_ID/echo-frontend:$IMAGE_TAG \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated

FRONTEND_URL="https://echo-frontend-${PROJECT_NUMBER}.${REGION}.run.app"
# Pass FRONTEND_ORIGIN for CORS (no commas in value to avoid gcloud parsing issues)
BACKEND_ENV="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,CLOUD_RUN_REGION=$REGION,RUN_JOB_NAME=echo-agent,FRONTEND_ORIGIN=${FRONTEND_URL}"
[ -n "$ECHO_GCS_BUCKET" ] && BACKEND_ENV="$BACKEND_ENV,ECHO_GCS_BUCKET=$ECHO_GCS_BUCKET"
[ -n "$FIREBASE_PROJECT_ID" ] && BACKEND_ENV="$BACKEND_ENV,FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID"
[ -n "$GEMINI_API_KEY" ] && BACKEND_ENV="$BACKEND_ENV,GEMINI_API_KEY=$GEMINI_API_KEY"

gcloud run deploy echo-backend \
  --image gcr.io/$PROJECT_ID/echo-backend:$IMAGE_TAG \
  --region $REGION \
  --platform managed \
  --set-env-vars "$BACKEND_ENV" \
  --allow-unauthenticated

echo "Deploying agent job..."
AGENT_ENV="HEADLESS=true"
[ -n "$ECHO_GCS_BUCKET" ] && AGENT_ENV="$AGENT_ENV,ECHO_GCS_BUCKET=$ECHO_GCS_BUCKET"
[ -n "$FIREBASE_PROJECT_ID" ] && AGENT_ENV="$AGENT_ENV,FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID"
if [ -n "$GEMINI_API_KEY" ]; then
  AGENT_ENV="$AGENT_ENV,GEMINI_API_KEY=$GEMINI_API_KEY"
fi
gcloud run jobs deploy echo-agent \
  --image gcr.io/$PROJECT_ID/echo-agent:$IMAGE_TAG \
  --region $REGION \
  --set-env-vars "$AGENT_ENV" \
  --memory 2Gi \
  --cpu 2 \
  --max-retries 0
# Also grant compute SA (used when no GOOGLE_APPLICATION_CREDENTIALS)
BACKEND_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud run jobs add-iam-policy-binding echo-agent \
  --region $REGION \
  --member="serviceAccount:${BACKEND_SA}" \
  --role="roles/run.invoker" \
  --quiet 2>/dev/null || true

echo ""
echo "Deployment complete!"
echo "Frontend: https://echo-frontend-${PROJECT_NUMBER}.${REGION}.run.app"
echo ""
echo ""
echo "If you see 500 errors on /api/users/init or /api/workflows: Firebase project (echo-1290a) != GCP project (echo-488222)."
echo "Add Firebase service account: see deploy.sh header for FIREBASE_SA_SECRET setup."
