"""
POST /api/synthesize: create workflow from video or screenshots.

Delegates synthesis logic to synthesis_agent; handles HTTP, auth, GCS, Firestore.
"""
import os
import re
import sys
import time
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from google import genai
from google.genai import types
import firebase_admin.firestore
from google.cloud.firestore import SERVER_TIMESTAMP
from pydantic import BaseModel as PydanticBaseModel

from app.auth import get_current_uid, get_firebase_app
from app.config import GEMINI_API_KEY, GCS_BUCKET
from app.services.gcs import upload_file, download_file as gcs_download_file

router = APIRouter(prefix="/synthesize", tags=["synthesis"])


def _ensure_agent_path() -> None:
    """Ensure agent (echo_prism) is on sys.path."""
    base = Path(__file__).resolve().parent.parent
    agent_dir = base / "agent" if (base / "agent").exists() else base / "backend" / "agent"
    if not agent_dir.exists():
        agent_dir = base.parent.parent / "backend" / "agent"
    agent_dir = agent_dir.resolve()
    if agent_dir.exists() and str(agent_dir) not in sys.path:
        sys.path.insert(0, str(agent_dir))


def _upload_to_gemini(content: bytes, mime_type: str) -> types.Part:
    """Upload file to Gemini Files API and return Part for generate_content."""
    client = genai.Client(api_key=GEMINI_API_KEY)
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
        f.write(content)
        path = f.name
    try:
        uploaded = client.files.upload(
            file=path, config=types.UploadFileConfig(mime_type=mime_type)
        )
        # Poll until active
        while getattr(uploaded.state, "name", str(uploaded.state)) == "PROCESSING":
            time.sleep(1)
            uploaded = client.files.get(name=uploaded.name)
        state_name = getattr(uploaded.state, "name", str(uploaded.state))
        if state_name != "ACTIVE":
            raise ValueError(f"File upload failed: {state_name}")
        uri = getattr(uploaded, "uri", None) or uploaded.name
        return types.Part.from_uri(file_uri=uri, mime_type=mime_type)
    finally:
        Path(path).unlink(missing_ok=True)


@router.post("")
async def synthesize(
    uid: str = Depends(get_current_uid),
    video: UploadFile | None = File(None),
    video_gcs_path: str | None = Form(None),
    workflow_name: str | None = Form(None),
    screenshots: list[UploadFile] = File(default=[]),
):
    """Create workflow from video or screenshots via Gemini 2.5 Pro.

    Video can be supplied either as a direct upload (``video`` field) **or** as
    a pre-uploaded GCS path (``video_gcs_path``).  The latter avoids the Cloud
    Run 32 MB request-body limit for large video files.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")
    if not GCS_BUCKET:
        raise HTTPException(
            status_code=500,
            detail="ECHO_GCS_BUCKET not configured (required for synthesis storage)",
        )

    has_video = bool(video or video_gcs_path)
    workflow_id = str(uuid.uuid4())
    _source_recording_id: str | None = None
    if video_gcs_path:
        _source_recording_id = video_gcs_path.rsplit("/", 1)[-1] if "/" in video_gcs_path else video_gcs_path
    elif video:
        _source_recording_id = video.filename or "video"
    elif screenshots:
        _sorted_ss = sorted(screenshots, key=lambda f: f.filename or "")
        _source_recording_id = _sorted_ss[0].filename if _sorted_ss else "screenshots"

    if has_video and screenshots:
        raise HTTPException(
            status_code=400, detail="Provide either video or screenshots, not both"
        )
    if not has_video and not screenshots:
        raise HTTPException(status_code=400, detail="Provide video or screenshots")

    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)

    workflow_ref = db.collection("workflows").document(workflow_id)
    workflow_ref.set(
        {
            "owner_uid": uid,
            "name": workflow_name or "Processing…",
            "status": "processing",
            "createdAt": SERVER_TIMESTAMP,
            "updatedAt": SERVER_TIMESTAMP,
        }
    )

    try:
        gcs_prefix = f"{uid}/{workflow_id}"
        parts: list[types.Part] = []
        mime_map = {
            "video/mp4": "video/mp4",
            "image/png": "image/png",
            "image/jpeg": "image/jpeg",
            "image/webp": "image/webp",
        }

        if video:
            content = await video.read()
            ct = video.content_type or "video/mp4"
            blob_name = f"{gcs_prefix}/{video.filename or 'video.mp4'}"
            upload_file(blob_name, content, ct)
            mime = mime_map.get(ct, "video/mp4")
            part = _upload_to_gemini(content, mime)
            parts.append(part)
        elif video_gcs_path:
            match = re.match(r"gs://[^/]+/(.+)", video_gcs_path)
            if not match:
                raise HTTPException(
                    status_code=400, detail="Invalid video_gcs_path format"
                )
            blob_name = match.group(1)
            ext = blob_name.rsplit(".", 1)[-1].lower() if "." in blob_name else ""
            ct = {
                "mp4": "video/mp4",
                "webm": "video/webm",
                "mov": "video/quicktime",
                "quicktime": "video/quicktime",
            }.get(ext, "video/mp4")
            content = gcs_download_file(blob_name)
            dest_blob = f"{gcs_prefix}/{blob_name.rsplit('/', 1)[-1]}"
            upload_file(dest_blob, content, ct)
            mime = mime_map.get(ct, "video/mp4")
            part = _upload_to_gemini(content, mime)
            parts.append(part)
        else:
            sorted_screenshots = sorted(screenshots, key=lambda f: f.filename or "")
            for i, f in enumerate(sorted_screenshots):
                content = await f.read()
                ct = f.content_type or "image/png"
                blob_name = f"{gcs_prefix}/{f.filename or f'image_{i}.png'}"
                upload_file(blob_name, content, ct)
                mime = mime_map.get(ct, "image/png")
                part = _upload_to_gemini(content, mime)
                parts.append(part)

        if not parts:
            raise HTTPException(status_code=400, detail="No media to process")

        _ensure_agent_path()
        from echo_prism.subagents.synthesis_agent import synthesize_workflow_from_media

        client = genai.Client(api_key=GEMINI_API_KEY)
        result = await synthesize_workflow_from_media(client, parts)
        steps_data = result["steps"]
        variables = result.get("variables", [])

        for i, s in enumerate(steps_data):
            step_id = str(uuid.uuid4())
            workflow_ref.collection("steps").document(step_id).set(
                {
                    "order": i,
                    "action": s.get("action", "wait"),
                    "context": s.get("context", ""),
                    "params": s.get("params", {}),
                    "expected_outcome": s.get("expected_outcome", ""),
                }
            )

        title = workflow_name or result.get("title") or "Untitled workflow"
        workflow_type = result.get("workflow_type", "browser")
        if workflow_type not in ("browser", "desktop"):
            workflow_type = "browser"

        from app.config import GCS_BUCKET as _GCS_BUCKET

        thumbnail_gcs_path: str | None = None
        if not has_video and screenshots:
            first_ss = sorted(screenshots, key=lambda f: f.filename or "")[0]
            blob_name_thumb = f"{gcs_prefix}/{first_ss.filename or 'image_0.png'}"
            thumbnail_gcs_path = f"gs://{_GCS_BUCKET}/{blob_name_thumb}"

        update_payload: dict = {
            "name": title,
            "workflow_type": workflow_type,
            "status": "ready",
            "updatedAt": SERVER_TIMESTAMP,
            "variables": sorted(variables),
        }
        if _source_recording_id:
            update_payload["source_recording_id"] = _source_recording_id
        if thumbnail_gcs_path:
            update_payload["thumbnail_gcs_path"] = thumbnail_gcs_path
        workflow_ref.update(update_payload)
        return {"workflow_id": workflow_id}
    except HTTPException:
        raise
    except Exception as e:
        workflow_ref.update(
            {
                "status": "failed",
                "error": str(e),
                "updatedAt": SERVER_TIMESTAMP,
            }
        )
        raise HTTPException(status_code=500, detail=str(e))


async def synthesize_from_description_impl(
    uid: str,
    name: str,
    description: str,
    workflow_type: str,
    db,
    ephemeral: bool = False,
) -> str:
    """Generate workflow steps from a natural language description. Returns workflow_id."""
    _ensure_agent_path()
    from echo_prism.subagents.synthesis_agent import synthesize_workflow_from_description

    workflow_id = str(uuid.uuid4())
    workflow_ref = db.collection("workflows").document(workflow_id)
    payload: dict = {
        "name": name,
        "status": "processing",
        "owner_uid": uid,
        "workflow_type": workflow_type
        if workflow_type in ("browser", "desktop")
        else "browser",
        "createdAt": SERVER_TIMESTAMP,
        "updatedAt": SERVER_TIMESTAMP,
    }
    if ephemeral:
        payload["ephemeral"] = True
    workflow_ref.set(payload)

    client = genai.Client(api_key=GEMINI_API_KEY)
    result = await synthesize_workflow_from_description(
        description, name, workflow_type, client
    )
    steps_data = result.get("steps", [])
    actual_type = result.get("workflow_type", workflow_type)
    if actual_type not in ("browser", "desktop"):
        actual_type = "browser"

    for i, s in enumerate(steps_data):
        step_id = str(uuid.uuid4())
        workflow_ref.collection("steps").document(step_id).set(
            {
                "order": i,
                "action": s.get("action", "wait"),
                "context": s.get("context", ""),
                "params": s.get("params", {}),
                "expected_outcome": s.get("expected_outcome", ""),
            }
        )

    workflow_ref.update(
        {
            "name": result.get("title") or name,
            "workflow_type": actual_type,
            "status": "ready",
            "updatedAt": SERVER_TIMESTAMP,
        }
    )
    return workflow_id


class DescriptionSynthesisRequest(PydanticBaseModel):
    name: str = "My Workflow"
    description: str
    workflow_type: str = "browser"


@router.post("/from-description")
async def synthesize_from_description_endpoint(
    body: DescriptionSynthesisRequest,
    uid: str = Depends(get_current_uid),
):
    """Create a workflow from a natural language description (no video required)."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    try:
        workflow_id = await synthesize_from_description_impl(
            uid, body.name, body.description, body.workflow_type, db
        )
        return {"workflow_id": workflow_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
