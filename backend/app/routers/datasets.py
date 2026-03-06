"""
Dataset endpoints for GUI Dataset Creator.

- save-image: Save PNG base64 to GCS
- save-json: Save COCO4GUI JSON
- list: List user's dataset files
- load: Load annotations JSON
- image: Return signed URL for image
"""
import base64
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.auth import get_current_uid
from app.config import GCS_BUCKET
from app.services.gcs import (
    download_file,
    generate_signed_read_url,
    list_blobs,
    upload_file,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/datasets", tags=["datasets"])

FOLDER_DATA = "data"
FOLDER_SEQUENCE = "sequence_data"


def _blob_prefix(uid: str, folder: str) -> str:
    return f"datasets/{uid}/{folder}/"


class SaveImageRequest(BaseModel):
    filename: str
    data: str  # base64 PNG
    folder: str = FOLDER_DATA


class SaveJsonRequest(BaseModel):
    filename: str
    data: dict
    folder: str = FOLDER_DATA


@router.post("/save-image")
async def save_image(
    req: SaveImageRequest,
    uid: str = Depends(get_current_uid),
):
    """Save PNG base64 to GCS datasets/{uid}/data/ or sequence_data/."""
    if not GCS_BUCKET:
        raise HTTPException(status_code=500, detail="GCS_BUCKET not configured")
    try:
        raw = req.data
        if raw.startswith("data:image/png;base64,"):
            raw = raw.replace("data:image/png;base64,", "", 1)
        content = base64.b64decode(raw)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64: {e}")

    folder = req.folder if req.folder in (FOLDER_DATA, FOLDER_SEQUENCE) else FOLDER_DATA
    blob_name = _blob_prefix(uid, folder) + req.filename
    try:
        path = upload_file(blob_name, content, "image/png")
        return {"success": True, "path": path}
    except Exception as e:
        logger.exception("Save image failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save-json")
async def save_json(
    req: SaveJsonRequest,
    uid: str = Depends(get_current_uid),
):
    """Save COCO4GUI JSON to GCS."""
    if not GCS_BUCKET:
        raise HTTPException(status_code=500, detail="GCS_BUCKET not configured")
    folder = req.folder if req.folder in (FOLDER_DATA, FOLDER_SEQUENCE) else FOLDER_DATA
    blob_name = _blob_prefix(uid, folder) + req.filename
    try:
        content = json.dumps(req.data, indent=2).encode("utf-8")
        path = upload_file(blob_name, content, "application/json")
        return {"success": True, "path": path}
    except Exception as e:
        logger.exception("Save JSON failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_datasets(
    uid: str = Depends(get_current_uid),
    folder: str = Query(FOLDER_DATA),
):
    """List blobs under datasets/{uid}/data/ or sequence_data/."""
    if not GCS_BUCKET:
        raise HTTPException(status_code=500, detail="GCS_BUCKET not configured")
    f = folder if folder in (FOLDER_DATA, FOLDER_SEQUENCE) else FOLDER_DATA
    prefix = _blob_prefix(uid, f)
    try:
        names = list_blobs(prefix)
        files = [n.replace(prefix, "") for n in names if n.endswith((".json", ".png", ".jpg", ".jpeg"))]
        return {"files": files}
    except Exception as e:
        logger.exception("List datasets failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/load")
async def load_dataset(
    uid: str = Depends(get_current_uid),
    folder: str = Query(FOLDER_DATA),
    filename: str = Query(..., alias="file"),
):
    """Load annotations JSON by folder and filename."""
    if not GCS_BUCKET:
        raise HTTPException(status_code=500, detail="GCS_BUCKET not configured")
    f = folder if folder in (FOLDER_DATA, FOLDER_SEQUENCE) else FOLDER_DATA
    blob_name = _blob_prefix(uid, f) + filename
    if ".." in filename or filename.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid filename")
    try:
        content = download_file(blob_name)
        return json.loads(content.decode("utf-8"))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Dataset not found")
    except Exception as e:
        logger.exception("Load dataset failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/image")
async def get_image_url(
    uid: str = Depends(get_current_uid),
    folder: str = Query(FOLDER_DATA),
    filename: str = Query(..., alias="file"),
):
    """Return signed URL for an image in the dataset."""
    if not GCS_BUCKET:
        raise HTTPException(status_code=500, detail="GCS_BUCKET not configured")
    f = folder if folder in (FOLDER_DATA, FOLDER_SEQUENCE) else FOLDER_DATA
    blob_name = _blob_prefix(uid, f) + filename
    if ".." in filename or filename.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid filename")
    try:
        url = generate_signed_read_url(blob_name, expiration_minutes=60)
        return {"url": url}
    except Exception as e:
        logger.exception("Get image URL failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
