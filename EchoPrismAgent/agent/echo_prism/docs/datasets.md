# EchoPrism Datasets

COCO4GUI format for UI automation training data. Used by trace export and Vertex fine-tuning.

## Modules

- **coco4gui_schema.py** — Dataclasses: `COCO4GUIImage`, `COCO4GUIAnnotation`, `COCO4GUICategory`, `COCO4GUIDataset`
- **coco4gui_builder.py** — Builds COCO4GUI datasets; adds images and annotations with normalized bbox/keypoints
- **coco4gui_importer.py** — Loads COCO4GUI JSON; yields Vertex SFT-style message examples

## Storage (GCS)

Dataset Creator stores all data under `datasets/{uid}/data/`:
- Images (PNG)
- `annotations_coco.json` (COCO4GUI format, includes sequence and non-sequence)

Use `--image-base-url gs://BUCKET/datasets/UID/data/` when preparing for Vertex AI fine-tuning. See [FINETUNING_README.md](FINETUNING_README.md).

## Usage

See `echo_prism/training/trace_coco_export.py` for trace-to-COCO conversion and [FINETUNING_README.md](FINETUNING_README.md) for fine-tuning workflows.
