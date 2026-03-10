"""
Upload agent screenshots to GCS and update Firestore so the frontend can stream the view.
Requires WORKFLOW_ID, RUN_ID, GCS_BUCKET env vars (set when running as Cloud Run Job).

URL strategy (in priority order):
  1. Public URL — if the bucket has allUsers:objectViewer IAM (simplest, great for dev/demo).
     Set GCS_PUBLIC_BUCKET=true in your .env to use this mode.
     Make the bucket public:
       gsutil iam ch allUsers:objectViewer gs://YOUR_BUCKET_NAME
  2. Signed URL — requires a service account JSON key set via GOOGLE_APPLICATION_CREDENTIALS.
     Ideal for production where the bucket should stay private.
  3. gs:// path fallback — stored when both of the above fail. Frontend shows a placeholder.
"""
import logging
import os

logger = logging.getLogger(__name__)


def _public_url(bucket_name: str, blob_name: str) -> str:
    """Build a plain HTTPS public URL for a GCS object (bucket must have public read)."""
    return f"https://storage.googleapis.com/{bucket_name}/{blob_name}"


def upload_screenshot(screenshot_bytes: bytes, url: str) -> None:
    """Upload screenshot to GCS and update run's lastScreenshotUrl in Firestore."""
    workflow_id = os.environ.get("WORKFLOW_ID")
    run_id = os.environ.get("RUN_ID")
    bucket_name = os.environ.get("ECHO_GCS_BUCKET") or os.environ.get("GCS_BUCKET")
    if not all((workflow_id, run_id, bucket_name)):
        return

    use_public = os.environ.get("GCS_PUBLIC_BUCKET", "").lower() in ("1", "true", "yes")

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

        screenshot_ref: str
        if use_public:
            # Public bucket — no signing needed, URL is immediately accessible
            screenshot_ref = _public_url(bucket_name, blob_name)
            logger.debug("Using public GCS URL for screenshot")
        else:
            # Attempt signed URL (requires service account private key).
            # Falls back to a public URL attempt, then gs:// path.
            try:
                from datetime import timedelta
                screenshot_ref = blob.generate_signed_url(
                    version="v4",
                    expiration=timedelta(hours=2),
                    method="GET",
                )
            except Exception:
                # No service account key available (local dev with OAuth token).
                # Try public URL as a best-effort — works if bucket is public.
                screenshot_ref = _public_url(bucket_name, blob_name)
                logger.debug(
                    "Signed URL unavailable — using public URL (set GCS_PUBLIC_BUCKET=true "
                    "or GOOGLE_APPLICATION_CREDENTIALS for signed URLs)"
                )

        db = firestore.client()
        run_ref = (
            db.collection("workflows")
            .document(workflow_id)
            .collection("runs")
            .document(run_id)
        )
        run_ref.update({
            "lastScreenshotUrl": screenshot_ref,
            "lastScreenshotAt": SERVER_TIMESTAMP,
        })
    except Exception as e:
        logger.warning("Failed to upload screenshot: %s", e)
