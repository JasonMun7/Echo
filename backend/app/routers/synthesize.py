"""
POST /api/synthesize: create workflow from video or screenshots using Gemini 2.5 Pro.
"""

import asyncio
import json
import re
import time
import uuid
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from google import genai
from google.genai import types
import firebase_admin.firestore
from google.cloud.firestore import SERVER_TIMESTAMP

from app.auth import get_current_uid, get_firebase_app
from app.config import GEMINI_API_KEY
from app.services.gcs import upload_file, download_file as gcs_download_file

router = APIRouter(prefix="/synthesize", tags=["synthesis"])

SYNTHESIS_PROMPT = """You are a workflow extraction expert. Analyze the provided video or sequence of screenshots and extract a step-by-step workflow that a user could automate.

For each step, output JSON with this exact structure:
{
  "steps": [
    {
      "action": "<action_type>",
      "context": "<human-readable description of what this step does>",
      "params": { ... action-specific key-value pairs ... },
      "risk": "low" | "medium" | "high"
    }
  ]
}

Available actions: open_web_browser, close_web_browser, navigate, click_at, type_text_at, scroll, wait, take_screenshot, select_option, hover, press_key, drag_drop, wait_for_element.

For each action, include appropriate params. Examples:
- navigate: { "url": "https://..." }
- click_at: { "selector": "button#submit", "description": "Submit button" }
- type_text_at: { "selector": "input#email", "text": "{{email}}" }
- scroll: { "direction": "down", "amount": 500 }
- wait: { "seconds": 2 }
- select_option: { "selector": "select#country", "value": "US" }
- press_key: { "key": "Enter" }
- open_web_browser: {}
- close_web_browser: {}
- wait_for_element: { "selector": ".loaded" }

Use {{variable}} for user-provided inputs. Set risk to "high" for steps that modify data, submit forms, or have irreversible effects.
Output ONLY valid JSON, no markdown or extra text."""


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
    screenshots: list[UploadFile] = File(default=[]),
):
    """Create workflow from video or screenshots via Gemini 2.5 Pro.

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
            "status": "processing",
            "createdAt": SERVER_TIMESTAMP,
            "updatedAt": SERVER_TIMESTAMP,
        }
    )

    try:
        # Upload to GCS
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
            # File was uploaded directly to GCS by the browser via signed URL.
            # Parse gs://bucket/blob-name  (bucket portion is ignored; we use
            # the configured GCS_BUCKET so we don't trust user input for it).
            match = re.match(r"gs://[^/]+/(.+)", video_gcs_path)
            if not match:
                raise HTTPException(
                    status_code=400, detail="Invalid video_gcs_path format"
                )
            blob_name = match.group(1)
            # Determine MIME from path extension
            ext = blob_name.rsplit(".", 1)[-1].lower() if "." in blob_name else ""
            ct = {
                "mp4": "video/mp4",
                "webm": "video/webm",
                "mov": "video/mp4",
                "quicktime": "video/mp4",
            }.get(ext, "video/mp4")
            content = gcs_download_file(blob_name)
            # Keep a copy in the workflow-scoped GCS prefix for reference
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

        # Call Gemini 2.5 Pro
        client = genai.Client(api_key=GEMINI_API_KEY)
        contents = [
            types.Content(
                role="user", parts=[types.Part.from_text(text=SYNTHESIS_PROMPT)] + parts
            )
        ]
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
        )
        response = client.models.generate_content(
            model="gemini-2.5-pro",
            contents=contents,
            config=config,
        )
        if not response.text:
            raise ValueError("Empty response from Gemini")
        data = json.loads(response.text)
        steps_data = data.get("steps", [])

        # Batch-write steps
        for i, s in enumerate(steps_data):
            step_id = str(uuid.uuid4())
            step_ref = workflow_ref.collection("steps").document(step_id)
            step_ref.set(
                {
                    "order": i,
                    "action": s.get("action", "wait"),
                    "context": s.get("context", ""),
                    "params": s.get("params", {}),
                    "risk": s.get("risk", "low"),
                }
            )

        workflow_ref.update(
            {
                "status": "ready",
                "updatedAt": SERVER_TIMESTAMP,
            }
        )
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
