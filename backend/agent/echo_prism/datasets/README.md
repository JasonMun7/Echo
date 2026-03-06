# EchoPrism Datasets

COCO4GUI format for UI automation training data. Used by trace export and Vertex fine-tuning.

## Modules

- **coco4gui_schema.py** — Dataclasses: `COCO4GUIImage`, `COCO4GUIAnnotation`, `COCO4GUICategory`, `COCO4GUIDataset`
- **coco4gui_builder.py** — Builds COCO4GUI datasets; adds images and annotations with normalized bbox/keypoints
- **coco4gui_importer.py** — Loads COCO4GUI JSON; yields Vertex SFT-style message examples

## Usage

See `echo_prism/training/trace_coco_export.py` for trace-to-COCO conversion and `docs/FINETUNING_README.md` for fine-tuning workflows.
