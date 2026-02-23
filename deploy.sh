#!/usr/bin/env bash
# Echo deployment script for Cloud Run
# Usage: ./deploy.sh [PROJECT_ID] [REGION]
# Or set PROJECT_ID, REGION, etc. in backend/.env and run: npm run deploy
#
# For Firestore/Auth access when Firebase project differs from GCP project:
# 1. In Firebase Console (echo-1290a) > Project Settings > Service Accounts > Generate new private key
# 2. Create secret: gcloud secrets create firebase-sa-key --data-file=path/to/keys/echo-1290a-*.json
# 3. Grant Cloud Run access: gcloud secrets add-iam-policy-binding firebase-sa-key --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
# 4. Set FIREBASE_SA_SECRET=firebase-sa-key in backend/.env before deploying
set -e

PROJECT_ID=${1:-$PROJECT_ID}
REGION=${2:-${REGION:-us-central1}}
[ -z "$PROJECT_ID" ] && { echo "Usage: ./deploy.sh PROJECT_ID [REGION] or set PROJECT_ID in backend/.env"; exit 1; }
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
[ -n "$GCS_BUCKET" ] && BACKEND_ENV="$BACKEND_ENV,GCS_BUCKET=$GCS_BUCKET"
[ -n "$FIREBASE_PROJECT_ID" ] && BACKEND_ENV="$BACKEND_ENV,FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID"
[ -n "$GEMINI_API_KEY" ] && BACKEND_ENV="$BACKEND_ENV,GEMINI_API_KEY=$GEMINI_API_KEY"

# Mount Firebase service account from Secret Manager (required when Firebase project != GCP project)
if [ -n "$FIREBASE_SA_SECRET" ]; then
  echo "Granting Cloud Run access to secret ${FIREBASE_SA_SECRET}..."
  BACKEND_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
  gcloud secrets add-iam-policy-binding "$FIREBASE_SA_SECRET" \
    --member="serviceAccount:${BACKEND_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet 2>/dev/null || true
  BACKEND_ENV="$BACKEND_ENV,GOOGLE_APPLICATION_CREDENTIALS=/secrets/firebase-sa-key.json"
  gcloud run deploy echo-backend \
    --image gcr.io/$PROJECT_ID/echo-backend:$IMAGE_TAG \
    --region $REGION \
    --platform managed \
    --set-env-vars "$BACKEND_ENV" \
    --set-secrets="/secrets/firebase-sa-key.json=${FIREBASE_SA_SECRET}:latest" \
    --allow-unauthenticated
else
  gcloud run deploy echo-backend \
    --image gcr.io/$PROJECT_ID/echo-backend:$IMAGE_TAG \
    --region $REGION \
    --platform managed \
    --set-env-vars "$BACKEND_ENV" \
    --allow-unauthenticated
fi

echo "Deploying agent job..."
AGENT_ENV="HEADLESS=true"
[ -n "$GCS_BUCKET" ] && AGENT_ENV="$AGENT_ENV,GCS_BUCKET=$GCS_BUCKET"
[ -n "$FIREBASE_PROJECT_ID" ] && AGENT_ENV="$AGENT_ENV,FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID"
if [ -n "$GEMINI_API_KEY" ]; then
  AGENT_ENV="$AGENT_ENV,GEMINI_API_KEY=$GEMINI_API_KEY"
fi
if [ -n "$FIREBASE_SA_SECRET" ]; then
  AGENT_ENV="$AGENT_ENV,GOOGLE_APPLICATION_CREDENTIALS=/secrets/firebase-sa-key.json"
  gcloud run jobs deploy echo-agent \
    --image gcr.io/$PROJECT_ID/echo-agent:$IMAGE_TAG \
    --region $REGION \
    --set-env-vars "$AGENT_ENV" \
    --set-secrets="/secrets/firebase-sa-key.json=${FIREBASE_SA_SECRET}:latest" \
    --memory 2Gi \
    --cpu 2 \
    --max-retries 0
else
  gcloud run jobs deploy echo-agent \
    --image gcr.io/$PROJECT_ID/echo-agent:$IMAGE_TAG \
    --region $REGION \
    --set-env-vars "$AGENT_ENV" \
    --memory 2Gi \
    --cpu 2 \
    --max-retries 0
fi

# Grant permission to invoke the agent job
# Backend uses Firebase SA (GOOGLE_APPLICATION_CREDENTIALS) when FIREBASE_SA_SECRET is set
echo "Granting permission to invoke agent job..."
if [ -n "$FIREBASE_SA_SECRET" ] && [ -f "backend/service-account.json" ]; then
  FIREBASE_SA_EMAIL=$(python3 -c "import json; print(json.load(open('backend/service-account.json'))['client_email'])" 2>/dev/null || true)
  if [ -n "$FIREBASE_SA_EMAIL" ]; then
    echo "Granting Firebase SA ($FIREBASE_SA_EMAIL) run.jobsExecutorWithOverrides on echo-agent"
    gcloud run jobs add-iam-policy-binding echo-agent \
      --region $REGION \
      --member="serviceAccount:${FIREBASE_SA_EMAIL}" \
      --role="roles/run.jobsExecutorWithOverrides" \
      --quiet 2>/dev/null || true
  fi
fi
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
