#!/usr/bin/env python3
"""
Prepare combined dataset (custom + optional traces) for Vertex AI fine-tuning.

Merges multiple JSONL datasets from GCS into one combined dataset.
Run prepare_coco4gui_for_vertex first as needed. For GroundCUA, use the Colab
notebook (notebooks/vertex_finetune_groundcua.ipynb) then merge with --sources.

Usage:
  # Merge custom (default):
  python scripts/prepare_combined_dataset.py

  # Include filtered traces:
  python scripts/prepare_combined_dataset.py --custom --traces

  # Merge with explicit GCS paths (incl. GroundCUA from Colab):
  python scripts/prepare_combined_dataset.py --sources gs://bucket/training/groundcua/dataset.jsonl,gs://bucket/training/custom/dataset.jsonl

Requires: google-cloud-storage. Set ECHO_GCS_BUCKET or GCS_BUCKET.
"""
import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(
        description="Merge custom COCO4GUI and optional traces into one JSONL"
    )
    parser.add_argument(
        "--output",
        default="training/combined/dataset.jsonl",
        help="GCS blob path for output JSONL",
    )
    parser.add_argument(
        "--custom",
        action="store_true",
        help="Include custom COCO4GUI dataset (training/custom/dataset.jsonl)",
    )
    parser.add_argument(
        "--traces",
        action="store_true",
        help="Include filtered traces from Firestore (requires DB connection)",
    )
    parser.add_argument(
        "--sources",
        default="",
        help="Comma-separated GCS URIs (overrides --custom)",
    )
    args = parser.parse_args()

    bucket = os.environ.get("ECHO_GCS_BUCKET") or os.environ.get("GCS_BUCKET")
    if not bucket:
        logger.error("Set ECHO_GCS_BUCKET or GCS_BUCKET")
        sys.exit(1)

    base = f"gs://{bucket}"
    gcs_uris: list[str] = []

    if args.sources:
        gcs_uris = [u.strip() for u in args.sources.split(",") if u.strip()]
    else:
        if args.custom:
            gcs_uris.append(f"{base}/training/custom/dataset.jsonl")
        if not gcs_uris:
            # Default: custom
            gcs_uris = [f"{base}/training/custom/dataset.jsonl"]
            logger.info("No sources specified, using default: custom")

    # If --traces, export traces from Firestore first, then add to sources
    if args.traces:
        traces_uri = f"{base}/training/traces/dataset.jsonl"
        try:
            from google.cloud import firestore

            # Add backend/agent to path before import
            repo_root = Path(__file__).resolve().parent.parent
            sys.path.insert(0, str(repo_root / "backend" / "agent"))
            sys.path.insert(0, str(repo_root / "backend"))
            from echo_prism.vertex_export import export_training_data

            db = firestore.Client()
            asyncio.run(
                export_training_data(
                    db,
                    output_gcs_path="training/traces/dataset.jsonl",
                    bucket_name=bucket,
                )
            )
            gcs_uris.append(traces_uri)
        except ImportError as e:
            logger.error("Cannot export traces (missing deps): %s", e)
            sys.exit(1)
        except Exception as e:
            logger.error("Trace export failed: %s", e)
            sys.exit(1)

    # Add backend/agent to path
    repo_root = Path(__file__).resolve().parent.parent
    agent_dir = repo_root / "backend" / "agent"
    backend_dir = repo_root / "backend"
    for d in (str(agent_dir), str(backend_dir)):
        if d not in sys.path:
            sys.path.insert(0, d)

    try:
        from echo_prism.vertex_export import prepare_combined_dataset
    except ImportError as e:
        logger.error("Import failed: %s. Run from repo root with backend/agent on PYTHONPATH.", e)
        sys.exit(1)

    # Normalize output to blob path (prepare_combined_dataset handles GCS)
    output_blob = args.output.replace(f"gs://{bucket}/", "").lstrip("/")
    if output_blob.startswith("gs://"):
        output_blob = output_blob.split("/", 3)[-1]

    try:
        count = prepare_combined_dataset(
            gcs_uris=gcs_uris,
            output_path=output_blob,
            bucket_name=bucket,
        )
        gcs_output = f"{base}/{output_blob}"
        logger.info("Combined dataset ready: %s (%d examples)", gcs_output, count)
    except ValueError as e:
        logger.error("%s", e)
        sys.exit(1)
    except Exception as e:
        logger.exception("Failed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
