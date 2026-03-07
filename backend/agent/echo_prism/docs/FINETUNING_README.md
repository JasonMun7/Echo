# EchoPrism Custom Dataset for Fine-Tuning

Convert custom COCO4GUI annotations to Vertex-native JSONL and upload to GCS. Use the resulting JSONL in Colab to fine-tune on top of your existing GroundCUA model.

## Prerequisites

- GCP project with Cloud Storage
- Doppler configured with `ECHO_GCS_BUCKET`
- `google-cloud-storage`, `Pillow` (see backend/requirements.txt)

## Workflow

### 1. Create annotations

Use the Dataset Creator at `/dashboard/datasets/create`, then export your dataset as COCO JSON.

### 2. Prepare and upload to GCS

All dataset images and `annotations_coco.json` live in `datasets/{uid}/data/`. Use that path as the image base URL:

```bash
pnpm coco4gui:prepare -- path/to/annotations_coco.json \
  --image-base-url gs://YOUR_BUCKET/datasets/YOUR_UID/data/ \
  --output training/custom/dataset.jsonl
```

This converts COCO4GUI to Vertex JSONL and uploads to `gs://YOUR_BUCKET/training/custom/dataset.jsonl`.

### 3. Fine-tune in Colab

Use the GCS JSONL URI in your Colab fine-tuning workflow as the custom dataset on top of your GroundCUA-prepared model.

## Output Format (Vertex-native)

Matches Vertex SFT schema:

```json
{
  "systemInstruction": {
    "role": "user",
    "parts": [{"text": "You are a GUI grounding agent. Given a screenshot and a task or instruction, locate the target GUI element and output only its center as normalized coordinates. Use the format point([x, y]) where x and y are in [0, 1] with 3 decimal places (e.g. point([0.850, 0.120])). (0, 0) is top-left, (1, 1) is bottom-right. Output nothing else—no explanation, labels, or extra text."}]
  },
  "contents": [
    {"role": "user", "parts": [
      {"fileData": {"mimeType": "image/png", "fileUri": "gs://bucket/..."}},
      {"text": "Locate the 'Submit' button."}
    ]},
    {"role": "model", "parts": [{"text": "point([0.850, 0.120])"}]}
  ]
}
```

Coordinates use 3-decimal [0.000, 1.000] normalization.
