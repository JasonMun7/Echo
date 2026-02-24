"""
Upload agent screenshots to GCS and update Firestore so the frontend can stream the view.
Requires WORKFLOW_ID, RUN_ID, GCS_BUCKET env vars (set when running as Cloud Run Job).
"""
import logging
import os
from datetime import timedelta

logger = logging.getLogger(__name__)


def upload_screenshot(screenshot_bytes: bytes, url: str) -> None:
    """Upload screenshot to GCS and update run's lastScreenshotUrl in Firestore."""
    workflow_id = os.environ.get("WORKFLOW_ID")
    run_id = os.environ.get("RUN_ID")
    bucket_name = os.environ.get("ECHO_GCS_BUCKET") or os.environ.get("GCS_BUCKET")
    if not all((workflow_id, run_id, bucket_name)):
        return

    try:
        from google.cloud import storage
        from firebase_admin import firestore
        from google.cloud.firestore import SERVER_TIMESTAMP

        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob_name = f"runs/{workflow_id}/{run_id}/latest.png"
        blob = bucket.blob(blob_name)
        blob.upload_from_string(
            screenshot_bytes,
            content_type="image/png",
        )
        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(hours=2),
            method="GET",
        )

        db = firestore.client()
        run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
        run_ref.update({
            "lastScreenshotUrl": signed_url,
            "lastScreenshotAt": SERVER_TIMESTAMP,
        })
    except Exception as e:
        logger.warning("Failed to upload screenshot: %s", e)
