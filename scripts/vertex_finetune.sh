#!/usr/bin/env bash
# Vertex AI fine-tuning for EchoPrism
# Requires: ECHO_GCP_PROJECT_ID, ECHO_GCS_BUCKET
# Run from repo root: ./scripts/vertex_finetune.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

: "${ECHO_GCP_PROJECT_ID:=$(gcloud config get-value project 2>/dev/null)}"
: "${ECHO_GCS_BUCKET:=$GCS_BUCKET}"

if [ -z "$ECHO_GCP_PROJECT_ID" ]; then
  echo "Set ECHO_GCP_PROJECT_ID or run: gcloud config set project YOUR_PROJECT"
  exit 1
fi
if [ -z "$ECHO_GCS_BUCKET" ]; then
  echo "Set ECHO_GCS_BUCKET"
  exit 1
fi

echo "Project: $ECHO_GCP_PROJECT_ID"
echo "Bucket:  gs://$ECHO_GCS_BUCKET"

# Dataset URI - use combined or single source
GCS_DATASET="${GCS_DATASET:-gs://${ECHO_GCS_BUCKET}/training/global/dataset.jsonl}"

echo "Dataset: $GCS_DATASET"
echo "Submitting Vertex AI SupervisedTuningJob..."

export PYTHONPATH="${REPO_ROOT}/backend:${REPO_ROOT}/backend/agent:${PYTHONPATH}"
python -c "
import asyncio
import os
import sys
sys.path.insert(0, 'backend')
sys.path.insert(0, 'backend/agent')
from echo_prism.vertex_export import create_tuning_job

async def run():
    job = await create_tuning_job(
        gcs_dataset_uri=os.environ['GCS_DATASET'],
        project=os.environ.get('ECHO_GCP_PROJECT_ID'),
        example_count=0,
    )
    print('Job submitted:', job)

asyncio.run(run())
"

echo "Done. Poll status with: curl -X POST /api/traces/poll-model"
