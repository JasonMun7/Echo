"""
POST /api/synthesize: create workflow from video or screenshots via EchoPrism-Synthesis.
"""

import asyncio
import json
import os
import re
import sys
import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from google import genai
import firebase_admin.firestore
from google.cloud.firestore import SERVER_TIMESTAMP

from app.auth import get_current_uid, get_firebase_app
from app.config import GEMINI_API_KEY
from app.services.gcs import upload_file, download_file as gcs_download_file

router = APIRouter(prefix="/synthesize", tags=["synthesis"])


def _ensure_agent_path() -> None:
    """Ensure backend/agent is on sys.path for echo_prism imports."""
    agent_dir = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "..", "agent")
    )
    if agent_dir not in sys.path:
        sys.path.insert(0, agent_dir)


@router.post("")
async def synthesize(
    uid: str = Depends(get_current_uid),
    video: UploadFile | None = File(None),
    video_gcs_path: str | None = Form(None),
    workflow_name: str | None = Form(None),
    screenshots: list[UploadFile] = File(default=[]),
):
    """Create workflow from video or screenshots via EchoPrism-Synthesis.

    Video can be supplied either as a direct upload (``video`` field) **or** as
    a pre-uploaded GCS path (``video_gcs_path``).  The latter avoids the Cloud
    Run 32 MB request-body limit for large video files.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    has_video = bool(video or video_gcs_path)

    # Accept video XOR screenshots
    if has_video and screenshots:
        raise HTTPException(
            status_code=400, detail="Provide either video or screenshots, not both"
        )
    if not has_video and not screenshots:
        raise HTTPException(status_code=400, detail="Provide video or screenshots")

    workflow_id = str(uuid.uuid4())
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)

    # Create workflow doc (processing)
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
        # Upload to GCS and build frames_bytes for EchoPrism synthesis
        gcs_prefix = f"{uid}/{workflow_id}"
        frames_bytes: list[bytes] = []
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
            _ensure_agent_path()
            from echo_prism.utils.video_frames import extract_frames_from_video
            frames_bytes = extract_frames_from_video(content, mime)
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
                "mov": "video/mp4",
                "quicktime": "video/mp4",
            }.get(ext, "video/mp4")
            content = gcs_download_file(blob_name)
            dest_blob = f"{gcs_prefix}/{blob_name.rsplit('/', 1)[-1]}"
            upload_file(dest_blob, content, ct)
            mime = mime_map.get(ct, "video/mp4")
            _ensure_agent_path()
            from echo_prism.utils.video_frames import extract_frames_from_video
            frames_bytes = extract_frames_from_video(content, mime)
        else:
            sorted_screenshots = sorted(screenshots, key=lambda f: f.filename or "")
            for i, f in enumerate(sorted_screenshots):
                content = await f.read()
                ct = f.content_type or "image/png"
                blob_name = f"{gcs_prefix}/{f.filename or f'image_{i}.png'}"
                upload_file(blob_name, content, ct)
                frames_bytes.append(content)

        if not frames_bytes:
            raise HTTPException(
                status_code=400,
                detail="No frames could be extracted from the video. Try screenshots instead.",
            )

        _ensure_agent_path()
        from echo_prism.models_config import SYNTHESIS_MODEL
        from echo_prism.subagents.synthesis_agent import synthesize_workflow_from_frames

        client = genai.Client(api_key=GEMINI_API_KEY)
        data = await synthesize_workflow_from_frames(
            frames_bytes,
            client,
            model=SYNTHESIS_MODEL,
        )
        steps_data = data.get("steps", [])

        # Post-processing: clamp coords, deduplicate, extract variables
        variables: set[str] = set()
        processed_steps: list[dict] = []
        prev_key: tuple | None = None
        for s in steps_data:
            params = dict(s.get("params", {}))
            # Clamp normalized coords to [0, 1000]
            for coord_key in ("x", "y", "x2", "y2"):
                if coord_key in params:
                    try:
                        params[coord_key] = max(0, min(1000, int(float(params[coord_key]))))
                    except (TypeError, ValueError):
                        params[coord_key] = 500
            # Extract {{variable}} templates
            for val in list(params.values()) + [s.get("context", "")]:
                if isinstance(val, str):
                    for m in re.findall(r"\{\{(\w+)\}\}", val):
                        variables.add(m)
            # Deduplicate consecutive identical (action, params) steps
            step_key = (s.get("action", ""), json.dumps(params, sort_keys=True))
            if step_key == prev_key:
                continue
            prev_key = step_key
            s_copy = dict(s)
            s_copy["params"] = params
            processed_steps.append(s_copy)

        steps_data = processed_steps

        # Batch-write steps (no risk field)
        for i, s in enumerate(steps_data):
            step_id = str(uuid.uuid4())
            step_ref = workflow_ref.collection("steps").document(step_id)
            step_ref.set(
                {
                    "order": i,
                    "action": s.get("action", "wait"),
                    "context": s.get("context", ""),
                    "params": s.get("params", {}),
                    "expected_outcome": s.get("expected_outcome", ""),
                }
            )

        # User-provided name takes priority over Gemini-generated title
        title = workflow_name or data.get("title") or f"Workflow {workflow_id[:8]}"
        workflow_type = data.get("workflow_type", "browser")
        if workflow_type not in ("browser", "desktop"):
            workflow_type = "browser"

        # Store the first image/frame GCS path as a thumbnail reference
        from app.config import GCS_BUCKET as _GCS_BUCKET
        thumbnail_gcs_path: str | None = None
        if not has_video and screenshots:
            first_ss = sorted(screenshots, key=lambda f: f.filename or "")[0]
            blob_name_thumb = f"{gcs_prefix}/{first_ss.filename or 'image_0.png'}"
            thumbnail_gcs_path = f"gs://{_GCS_BUCKET}/{blob_name_thumb}"
        elif has_video:
            # Use first screenshot taken during synthesis if we stored one,
            # otherwise leave unset — video thumbnails can be extracted later.
            pass

        update_payload: dict = {
            "name": title,
            "workflow_type": workflow_type,
                "status": "ready",
                "updatedAt": SERVER_TIMESTAMP,
            "variables": sorted(variables),
            }
        if thumbnail_gcs_path:
            update_payload["thumbnail_gcs_path"] = thumbnail_gcs_path
        workflow_ref.update(update_payload)
        return {"workflow_id": workflow_id}
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
) -> str:
    """Generate workflow steps from a natural language description. Returns workflow_id."""
    workflow_id = str(uuid.uuid4())
    workflow_ref = db.collection("workflows").document(workflow_id)
    workflow_ref.set({
        "name": name,
        "status": "processing",
        "owner_uid": uid,
        "workflow_type": workflow_type if workflow_type in ("browser", "desktop") else "browser",
        "createdAt": SERVER_TIMESTAMP,
        "updatedAt": SERVER_TIMESTAMP,
    })

    _ensure_agent_path()
    from echo_prism.models_config import DESCRIPTION_MODEL
    from echo_prism.subagents.description_synthesis_agent import synthesize_workflow_from_description

    client = genai.Client(api_key=GEMINI_API_KEY)
    data = await synthesize_workflow_from_description(
        description, name, workflow_type, client, model=DESCRIPTION_MODEL
    )
    steps_data = data.get("steps", [])

    for i, s in enumerate(steps_data):
        step_id = str(uuid.uuid4())
        workflow_ref.collection("steps").document(step_id).set({
            "order": i,
            "action": s.get("action", "wait"),
            "context": s.get("context", ""),
            "params": s.get("params", {}),
            "expected_outcome": s.get("expected_outcome", ""),
        })

    actual_type = data.get("workflow_type", workflow_type)
    if actual_type not in ("browser", "desktop"):
        actual_type = "browser"

    workflow_ref.update({
        "name": data.get("title") or name,
        "workflow_type": actual_type,
        "status": "ready",
        "updatedAt": SERVER_TIMESTAMP,
    })
    return workflow_id


from pydantic import BaseModel as PydanticBaseModel


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
