import datetime
import os

from google.cloud import storage
from app.config import GCS_BUCKET, GOOGLE_APPLICATION_CREDENTIALS


def get_bucket():
    if not GCS_BUCKET:
        raise ValueError("GCS_BUCKET environment variable is not set")
    client = storage.Client()
    return client.bucket(GCS_BUCKET)


def upload_file(
    blob_name: str,
    data: bytes,
    content_type: str | None = None,
) -> str:
    bucket = get_bucket()
    blob = bucket.blob(blob_name)
    blob.upload_from_string(data, content_type=content_type)
    return f"gs://{GCS_BUCKET}/{blob_name}"


def download_file(blob_name: str) -> bytes:
    bucket = get_bucket()
    blob = bucket.blob(blob_name)
    return blob.download_as_bytes()


def delete_file(blob_name: str) -> None:
    bucket = get_bucket()
    blob = bucket.blob(blob_name)
    blob.delete()


def generate_signed_upload_url(
    blob_name: str,
    content_type: str,
    expiration_minutes: int = 15,
) -> str:
    """Return a GCS v4 signed URL that allows a browser to PUT a file directly.

    Requires service-account credentials with the ``storage.objects.create``
    permission (and the private key available for signing).  When
    ``GOOGLE_APPLICATION_CREDENTIALS`` points to a service-account JSON key
    file that key is used; otherwise falls back to ADC (works on Cloud Run
    with Workload Identity only if the SA has iam.serviceAccounts.signBlob).
    """
    if GOOGLE_APPLICATION_CREDENTIALS and os.path.isfile(
        GOOGLE_APPLICATION_CREDENTIALS
    ):
        from google.oauth2 import service_account as sa_module

        credentials = sa_module.Credentials.from_service_account_file(
            GOOGLE_APPLICATION_CREDENTIALS
        )
        client = storage.Client(credentials=credentials)
    else:
        credentials = None
        client = storage.Client()

    blob = client.bucket(GCS_BUCKET).blob(blob_name)
    return blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(minutes=expiration_minutes),
        method="PUT",
        content_type=content_type,
        credentials=credentials,
    )
