#!/usr/bin/env python3
"""
Prepare custom COCO4GUI dataset for Vertex AI fine-tuning.

Outputs Vertex-native JSONL (systemInstruction + contents with fileData) for
Vertex AI fine-tuning or concatenation with other sources.

Usage:
  # Images already in GCS (e.g. from Dataset Creator):
  pnpm coco4gui:prepare -- path/to/annotations_coco.json \\
    --image-base-url gs://bucket/datasets/USER_UID/data/ \\
    --output training/custom/dataset.jsonl

  # Upload local images first:
  pnpm coco4gui:prepare -- path/to/coco4gui.json --images-dir ./screenshots \\
    --output training/custom/dataset.jsonl

Requires: google-cloud-storage. Set ECHO_GCS_BUCKET or GCS_BUCKET.
"""
import argparse
import io
import json
import logging
import os
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def _upload_images_to_gcs(
    coco_path: Path,
    images_dir: Path,
    bucket_name: str,
    gcs_prefix: str,
) -> str:
    """Upload images referenced in COCO4GUI to GCS. Returns image_base_url."""
    with open(coco_path, encoding="utf-8") as f:
        data = json.load(f)
    images = data.get("images", [])
    if not images:
        return f"gs://{bucket_name}/{gcs_prefix.rstrip('/')}/"

    from google.cloud import storage
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    uploaded = 0
    for img in images:
        file_name = img.get("file_name", "")
        if not file_name:
            continue
        local_path = images_dir / file_name
        if not local_path.exists():
            logger.warning("Image not found: %s", local_path)
            continue
        blob_name = f"{gcs_prefix.rstrip('/')}/{file_name}"
        blob = bucket.blob(blob_name)
        blob.upload_from_filename(str(local_path), content_type="image/png")
        uploaded += 1
    logger.info("Uploaded %d images to gs://%s/%s", uploaded, bucket_name, gcs_prefix)
    return f"gs://{bucket_name}/{gcs_prefix.rstrip('/')}/"


def main():
    parser = argparse.ArgumentParser(
        description="Convert COCO4GUI JSON to Vertex SFT JSONL and upload to GCS"
    )
    parser.add_argument(
        "coco_path",
        help="Path to COCO4GUI JSON file",
    )
    parser.add_argument(
        "--output",
        default="training/custom/dataset.jsonl",
        help="GCS blob path for output JSONL",
    )
    parser.add_argument(
        "--image-base-url",
        default="",
        help="GCS base URL for images, e.g. gs://bucket/training/custom/images/",
    )
    parser.add_argument(
        "--images-dir",
        default="",
        help="Local dir containing images (uploads to GCS if set)",
    )
    parser.add_argument(
        "--format",
        choices=["vertex", "messages"],
        default="vertex",
        help="Output format: vertex (default, matches Colab) or messages (legacy)",
    )
    args = parser.parse_args()

    bucket = os.environ.get("ECHO_GCS_BUCKET") or os.environ.get("GCS_BUCKET")
    if not bucket:
        logger.error("Set ECHO_GCS_BUCKET or GCS_BUCKET")
        sys.exit(1)

    coco_path = Path(args.coco_path)
    if not coco_path.exists():
        logger.error("COCO4GUI file not found: %s", coco_path)
        sys.exit(1)

    image_base_url = args.image_base_url
    if args.images_dir:
        images_dir = Path(args.images_dir)
        if not images_dir.is_dir():
            logger.error("Images dir not found: %s", images_dir)
            sys.exit(1)
        gcs_prefix = "training/custom/images"
        image_base_url = _upload_images_to_gcs(
            coco_path, images_dir, bucket, gcs_prefix
        )
    elif not image_base_url:
        image_base_url = f"gs://{bucket}/training/custom/images/"
        logger.warning(
            "No --image-base-url or --images-dir. Using %s - ensure images exist there.",
            image_base_url,
        )

    # Add backend/agent to path
    repo_root = Path(__file__).resolve().parent.parent
    agent_dir = repo_root / "backend" / "agent"
    backend_dir = repo_root / "backend"
    for d in (str(agent_dir), str(backend_dir)):
        if d not in sys.path:
            sys.path.insert(0, d)

    try:
        from echo_prism.datasets.coco4gui_importer import coco4gui_to_vertex_examples
    except ImportError as e:
        logger.error("Import failed: %s. Run from repo root with backend/agent on PYTHONPATH.", e)
        sys.exit(1)

    examples = []
    for ex in coco4gui_to_vertex_examples(
        coco_path, image_base_url=image_base_url, format=args.format
    ):
        examples.append(ex)

    if not examples:
        logger.warning("No examples produced. Ensure annotations have task_description and bbox/keypoints.")
        sys.exit(1)

    logger.info("Converted %d examples", len(examples))
    buf = io.BytesIO()
    for ex in examples:
        buf.write((json.dumps(ex) + "\n").encode("utf-8"))
    buf.seek(0)

    output_path = args.output.replace(f"gs://{bucket}/", "").lstrip("/")
    if output_path == args.output and args.output.startswith("gs://"):
        output_path = args.output.split("/", 3)[-1]

    try:
        from google.cloud import storage
        client = storage.Client()
        bucket_obj = client.bucket(bucket)
        blob = bucket_obj.blob(output_path)
        blob.upload_from_file(buf, content_type="application/jsonl")
        gcs_uri = f"gs://{bucket}/{output_path}"
        logger.info("Uploaded to %s", gcs_uri)
    except Exception as e:
        logger.error("GCS upload failed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
