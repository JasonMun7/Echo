import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel

from app.auth import get_current_uid
from app.config import GCS_BUCKET
from app.services.gcs import upload_file, generate_signed_upload_url

router = APIRouter(prefix="/storage", tags=["storage"])


@router.post("/upload")
async def upload(
    file: UploadFile,
    uid: str = Depends(get_current_uid),
):
    try:
        content = await file.read()
        blob_name = f"users/{uid}/{file.filename or 'file'}"
        path = upload_file(blob_name, content, file.content_type)
        return {"path": path}
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


class SignedUploadRequest(BaseModel):
    filename: str
    content_type: str


@router.post("/signed-upload-url")
async def get_signed_upload_url(
    req: SignedUploadRequest,
    uid: str = Depends(get_current_uid),
):
    """Return a short-lived GCS signed URL so the browser can PUT a large file
    directly to Cloud Storage, bypassing the Cloud Run 32 MB request limit."""
    try:
        blob_name = f"uploads/{uid}/{uuid.uuid4()}/{req.filename}"
        signed_url = generate_signed_upload_url(blob_name, req.content_type)
        gcs_path = f"gs://{GCS_BUCKET}/{blob_name}"
        return {"signed_url": signed_url, "gcs_path": gcs_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
