# EchoPrism Fine-Tuning

Vertex AI supervised fine-tuning for EchoPrism grounding and reasoning.

## Prerequisites

- GCP project with Vertex AI API enabled
- Doppler configured with `ECHO_GCP_PROJECT_ID`, `ECHO_GCS_BUCKET`
- `google-cloud-aiplatform` installed

## Data Sources

1. **GroundCUA** — ServiceNow/GroundCUA via Colab (see below)
2. **COCO4GUI** — Custom annotations from Dataset Creator UI
3. **Filtered traces** — EchoPrism run traces (good/bad + corrected thought)

## GroundCUA (Colab)

GroundCUA is large (~50k images). Run it in Google Colab or Vertex AI Workbench:

Open [`notebooks/vertex_finetune_groundcua.ipynb`](../../notebooks/vertex_finetune_groundcua.ipynb). It:
- Downloads GroundCUA from HuggingFace (Colab has ample disk)
- Converts to Vertex SFT format and uploads to GCS
- Submits the Vertex AI tuning job

To merge GroundCUA with custom/traces after Colab, use `--sources`:

```bash
python scripts/prepare_combined_dataset.py --sources gs://BUCKET/training/groundcua/dataset.jsonl,gs://BUCKET/training/custom/dataset.jsonl --output training/combined/dataset.jsonl
```

## Workflow (Custom + Traces)

### Quick start (pnpm + Doppler)

```bash
pnpm coco4gui:prepare -- path/to/coco4gui.json --images-dir path/to/images
pnpm dataset:combined        # Merge custom
pnpm dataset:combined:all    # Merge custom + traces
pnpm finetune:combined       # Fine-tune
pnpm finetune                # Or use GCS_DATASET
```

### 1. Create Custom Data

Use the Dataset Creator UI at `/dashboard/datasets/create` to:

- Upload screenshots
- Draw bounding boxes and click points
- Set action types and task descriptions
- Export COCO4GUI JSON

### 2. Prepare Custom COCO4GUI for Vertex

```bash
# If images are local (uploads to GCS):
pnpm coco4gui:prepare -- path/to/coco4gui.json --images-dir path/to/images --output training/custom/dataset.jsonl

# If images already in GCS:
pnpm coco4gui:prepare -- path/to/coco4gui.json --image-base-url gs://YOUR_BUCKET/training/custom/images/
```

### 3. Combine Datasets

```bash
# Merge custom only:
pnpm dataset:combined

# Merge custom + filtered traces:
pnpm dataset:combined:all

# Merge with explicit GCS paths (incl. GroundCUA from Colab):
python scripts/prepare_combined_dataset.py --sources gs://BUCKET/training/groundcua/dataset.jsonl,gs://BUCKET/training/custom/dataset.jsonl
```

### 4. Run Fine-Tune

```bash
pnpm finetune:combined

# Or custom GCS path:
GCS_DATASET=gs://YOUR_BUCKET/training/combined/dataset.jsonl pnpm finetune
```

Or via API:

```
POST /api/traces/export
```

### 5. Poll for Completion

```
POST /api/traces/poll-model
```

When `job_status` is `ready`, the global model is updated and all EchoPrism runs use the improved model.

## Output Format

Vertex 2026 message-based multimodal:

```json
{
  "messages": [
    {"role": "user", "content": [
      {"type": "image", "image_url": {"url": "gs://..."}},
      {"type": "text", "text": "Locate the 'Submit' button."}
    ]},
    {"role": "model", "content": [{"type": "text", "text": "point([0.850, 0.120])"}]}
  ]
}
```

Coordinates use 3-decimal [0.000, 1.000] normalization.
