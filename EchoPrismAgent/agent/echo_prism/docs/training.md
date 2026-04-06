# EchoPrism Training

Training utilities for UI-TARS self-improvement: rule-based trace filtering, COCO export, and Vertex AI fine-tuning.

## Modules

- **trace_filter.py** — Rule-based trace scoring only; writes to `filtered_traces` collection
- **trace_coco_export.py** — Exports run traces to COCO4GUI JSON for fine-tuning
- **vertex_export.py** — Builds JSONL from filtered traces, uploads to GCS, submits Vertex SupervisedTuningJob

## Pipeline

1. **Score trace** — After a run completes, `score_trace()` applies rule-based scoring only; stores in `filtered_traces/{workflow_id}_{run_id}`.
2. **Export COCO** — `export_run_to_coco()` / `export_and_upload_coco()` convert traces to COCO4GUI format.
3. **Vertex fine-tuning** — `export_training_data()` builds global JSONL; `create_tuning_job()` submits to Vertex; `global_model/current` stores the resulting model.

## Global Model

All users share one fine-tuned EchoPrism model. The parent agent resolves it from `global_model/current` in Firestore.
