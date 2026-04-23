"""
POST /api/synthesize: create workflow from video or screenshots.

Delegates synthesis logic to synthesis.pipeline; handles HTTP, auth, GCS, Firestore.
Workflow JSON may include ``api_call`` steps; Composio slug + arguments reference text is injected from
``echo_prism_agent.integrations.api_call_catalog``.
"""

import asyncio
import logging
import os
import re
import sys
import tempfile
import uuid
from pathlib import Path

import firebase_admin.firestore
from app.auth import get_current_uid, get_firebase_app
from app.config import GCS_BUCKET, GEMINI_API_KEY
from app.services.gcs import download_file as gcs_download_file
from app.services.gcs import generate_signed_read_url, upload_file
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from google import genai
from google.cloud.firestore import SERVER_TIMESTAMP
from google.genai import types
from pydantic import BaseModel as PydanticBaseModel

router = APIRouter(prefix="/synthesize", tags=["synthesis"])
_log = logging.getLogger(__name__)

_GS_URI_RE = re.compile(r"^gs://[^/]+/(.+)$")


def _blob_from_gs_uri(uri: str) -> str | None:
    m = _GS_URI_RE.match(uri.strip())
    return m.group(1) if m else None


def _safe_rel_path(raw: str) -> str | None:
    t = raw.strip().lstrip("/").replace("\\", "/")
    if not t:
        return None
    for seg in t.split("/"):
        if seg == "..":
            return None
    return t


def _resolve_to_signed_url(url: str, folder_prefix: str) -> str:
    u = url.strip()
    if not u:
        return ""
    if u.startswith("http://") or u.startswith("https://"):
        return u
    if u.startswith("gs://"):
        bn = _blob_from_gs_uri(u)
        if bn:
            try:
                return generate_signed_read_url(bn)
            except Exception:
                return u
        return u
    rel = _safe_rel_path(u)
    if rel and folder_prefix:
        blob = f"{folder_prefix}/{rel}"
        try:
            return generate_signed_read_url(blob)
        except Exception:
            return u
    return u


def _sanitize_context_attachments(raw: object, folder_prefix: str) -> list[dict] | None:
    if not isinstance(raw, list):
        return None
    out: list[dict] = []
    for i, item in enumerate(raw[:12]):
        if not isinstance(item, dict):
            continue
        url_raw = item.get("url") or item.get("gcs_blob") or ""
        if not isinstance(url_raw, str) or not url_raw.strip():
            continue
        signed = _resolve_to_signed_url(url_raw, folder_prefix)
        if not signed:
            continue
        kind = item.get("kind")
        if kind not in ("image", "video", "file"):
            kind = "image"
        name = item.get("name") if isinstance(item.get("name"), str) else f"attachment-{i + 1}"
        aid = (
            item.get("id")
            if isinstance(item.get("id"), str) and str(item.get("id") or "").strip()
            else str(uuid.uuid4())
        )
        entry: dict = {"id": aid, "kind": kind, "name": name, "url": signed}
        mime = item.get("mime")
        if isinstance(mime, str) and mime.strip():
            entry["mime"] = mime.strip()
        ref = item.get("ref_label")
        if isinstance(ref, str) and ref.strip():
            entry["ref_label"] = ref.strip().lower()
        else:
            entry["ref_label"] = f"c{len(out) + 1}"
        out.append(entry)
    return out or None


def _hydrate_step_dict(step: dict, folder_prefix: str) -> dict:
    s = dict(step)
    fiu = s.get("frame_image_url")
    if isinstance(fiu, str) and fiu.strip():
        s["frame_image_url"] = _resolve_to_signed_url(fiu.strip(), folder_prefix)
    ca = _sanitize_context_attachments(s.get("context_attachments"), folder_prefix)
    if ca is not None:
        s["context_attachments"] = ca
    elif "context_attachments" in s:
        del s["context_attachments"]
    return s


_IMG_BASENAME_RE = re.compile(r"^image_(\d+)\.png$", re.I)


def _clamp_synthesis_image_refs_in_steps(steps: list[dict], *, hi: int) -> None:
    """Drop model overshoot: relative ``image_N.png`` must not exceed last uploaded screenshot index."""
    if hi < 0:
        return
    for s in steps:
        fiu = s.get("frame_image_url")
        if isinstance(fiu, str):
            rel = _safe_rel_path(fiu.strip())
            if rel:
                leaf = rel.split("/")[-1]
                m = _IMG_BASENAME_RE.match(leaf)
                if m and int(m.group(1)) > hi:
                    s["frame_image_url"] = f"image_{hi}.png"
        raw_ca = s.get("context_attachments")
        if not isinstance(raw_ca, list):
            continue
        for item in raw_ca:
            if not isinstance(item, dict):
                continue
            for key in ("url", "gcs_blob"):
                raw_u = item.get(key)
                if not isinstance(raw_u, str) or not raw_u.strip():
                    continue
                rel = _safe_rel_path(raw_u.strip())
                if not rel:
                    continue
                leaf = rel.split("/")[-1]
                m = _IMG_BASENAME_RE.match(leaf)
                if m and int(m.group(1)) > hi:
                    item[key] = f"image_{hi}.png"


def _video_synthesis_max_image_index(steps: list[dict], *, uploaded_max_index: int) -> int:
    """
    Allow up to one keyframe index per synthesized step so the model can map different steps to
    different stills over time (capped by how many frames were actually uploaded).
    """
    if uploaded_max_index < 0:
        return -1
    n_steps = sum(1 for s in steps if isinstance(s, dict))
    if n_steps <= 0:
        return uploaded_max_index
    return min(uploaded_max_index, n_steps - 1)


def _delete_extra_video_keyframes(gcs_prefix: str, *, keep_last_index: int, total_uploaded: int) -> None:
    from app.services.gcs import delete_file

    if keep_last_index >= total_uploaded - 1:
        return
    for i in range(keep_last_index + 1, total_uploaded):
        try:
            delete_file(f"{gcs_prefix}/image_{i}.png")
        except Exception as e:
            _log.debug("delete extra keyframe image_%s.png: %s", i, e)


def _host_from_url(url: str) -> str | None:
    from urllib.parse import urlparse

    try:
        u = urlparse(url.strip() if "://" in url else f"https://{url.strip()}")
        h = (u.hostname or "").lower()
        if h.startswith("www."):
            h = h[4:]
        return h if h and "." in h else None
    except Exception:
        return None


def _brand_domain_one(step: dict) -> str | None:
    action = (step.get("action") or "").lower().replace("_", "")
    params = step.get("params") or {}
    if not isinstance(params, dict):
        return None
    if action == "navigate":
        u = params.get("url")
        if isinstance(u, str) and u.strip():
            return _host_from_url(u)
    if action in ("openapp", "focusapp"):
        bd = params.get("brand_domain")
        if isinstance(bd, str) and bd.strip():
            raw = bd.strip().lower()
            if raw.startswith("www."):
                raw = raw[4:]
            if "." in raw:
                return raw.split("/")[0].split("?")[0]
        app = params.get("app")
        if isinstance(app, str) and app.strip() and "." in app:
            raw = app.strip().lower()
            if raw.startswith("www."):
                raw = raw[4:]
            return raw.split("/")[0].split("?")[0]
    return None


def _brand_domain_from_steps(steps: list) -> str | None:
    for s in steps:
        if not isinstance(s, dict):
            continue
        d = _brand_domain_one(s)
        if d:
            return d
    return None


def _step_firestore_payload(order: int, s: dict) -> dict:
    """Build Firestore step document; pass through optional Scribe-style fields when synthesis emits them."""
    payload: dict = {
        "order": order,
        "action": s.get("action", "wait"),
        "context": s.get("context", ""),
        "params": s.get("params", {}),
        "expected_outcome": s.get("expected_outcome", ""),
    }
    fiu = s.get("frame_image_url")
    if fiu:
        payload["frame_image_url"] = str(fiu).strip()
    co = s.get("click_overlay")
    if co is not None and isinstance(co, dict):
        payload["click_overlay"] = co
    ca = s.get("context_attachments")
    if isinstance(ca, list) and ca:
        payload["context_attachments"] = ca
    return payload


def _ensure_agent_path() -> None:
    """Ensure agent service root is on sys.path so `echo_prism_agent` imports resolve."""
    root = Path(__file__).resolve().parent.parent
    if root.exists() and str(root) not in sys.path:
        sys.path.insert(0, str(root))


def _jpeg_bytes_to_png_bytes(jpeg: bytes) -> bytes:
    """Faster than Pillow for BGR→PNG; input is JPEG from OpenCV extract."""
    import cv2
    import numpy as np
    from echo_prism_agent.ui_tars.screenshot_pipeline import _normalize_bgr_frame_for_swscale

    arr = np.frombuffer(jpeg, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("jpeg decode failed")
    bgr = _normalize_bgr_frame_for_swscale(bgr)
    if bgr is None:
        raise ValueError("frame normalize failed")
    ok, buf = cv2.imencode(".png", bgr, [int(cv2.IMWRITE_PNG_COMPRESSION), 3])
    if not ok:
        raise ValueError("png encode failed")
    return buf.tobytes()


def _extract_and_upload_video_keyframes(content: bytes, mime: str, gcs_prefix: str) -> int:
    """
    Sample frames from the recording, upload as ``image_0.png`` … so step context URLs exist
    (video-only synthesis previously had no ``image_*`` objects under ``gcs_prefix``).
    """
    _ensure_agent_path()
    from echo_prism_agent.ui_tars.screenshot_pipeline import extract_frames_from_video

    max_f = int(os.environ.get("ECHOPRISM_SYNTHESIS_VIDEO_MAX_FRAMES", "24") or 24)
    max_f = max(1, min(max_f, 120))
    fps_sample = float(os.environ.get("ECHOPRISM_SYNTHESIS_VIDEO_FPS_SAMPLE", "0.6") or 0.6)
    skip_s = float(os.environ.get("ECHOPRISM_SYNTHESIS_VIDEO_SKIP_INITIAL_S", "0.5") or 0.5)

    try:
        frames = extract_frames_from_video(
            content,
            mime,
            max_frames=max_f,
            fps_sample=fps_sample,
            skip_initial_seconds=skip_s,
        )
    except Exception as e:
        _log.warning("video keyframe extraction failed: %s", e)
        return 0

    if not frames:
        _log.warning("video keyframe extraction produced 0 frames (mime=%s, bytes=%d)", mime, len(content))
        return 0

    uploaded = 0
    for i, jpeg in enumerate(frames):
        try:
            png = _jpeg_bytes_to_png_bytes(jpeg)
            upload_file(f"{gcs_prefix}/image_{i}.png", png, "image/png")
            uploaded += 1
        except Exception as e:
            _log.warning("upload keyframe image_%s.png failed: %s", i, e)
    _log.info("video keyframes uploaded count=%d under prefix=%s/", uploaded, gcs_prefix)
    return uploaded


async def _upload_to_gemini(
    content: bytes,
    mime_type: str,
    *,
    max_wait_seconds: int = 300,
) -> types.Part:
    """Upload file to Gemini Files API and return Part for generate_content."""
    client = genai.Client(api_key=GEMINI_API_KEY)
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
        f.write(content)
        path = f.name
    try:
        uploaded = client.files.upload(file=path, config=types.UploadFileConfig(mime_type=mime_type))
        loop = asyncio.get_running_loop()
        deadline = loop.time() + max_wait_seconds
        while getattr(uploaded.state, "name", str(uploaded.state)) == "PROCESSING":
            if loop.time() >= deadline:
                raise TimeoutError(
                    f"Gemini file upload still processing after {max_wait_seconds}s (name={uploaded.name!r})"
                )
            await asyncio.sleep(1)
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
        raise HTTPException(status_code=400, detail="Provide either video or screenshots, not both")
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
        max_screenshot_index = -1
        video_keyframe_upload_count = 0
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
            part, n_key = await asyncio.gather(
                _upload_to_gemini(content, mime),
                asyncio.to_thread(_extract_and_upload_video_keyframes, content, mime, gcs_prefix),
            )
            parts.append(part)
            video_keyframe_upload_count = n_key
            if n_key > 0:
                max_screenshot_index = n_key - 1
        elif video_gcs_path:
            match = re.match(r"gs://[^/]+/(.+)", video_gcs_path)
            if not match:
                raise HTTPException(status_code=400, detail="Invalid video_gcs_path format")
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
            part, n_key = await asyncio.gather(
                _upload_to_gemini(content, mime),
                asyncio.to_thread(_extract_and_upload_video_keyframes, content, mime, gcs_prefix),
            )
            parts.append(part)
            video_keyframe_upload_count = n_key
            if n_key > 0:
                max_screenshot_index = n_key - 1
        else:
            sorted_screenshots = sorted(screenshots, key=lambda f: f.filename or "")
            max_screenshot_index = len(sorted_screenshots) - 1
            for i, f in enumerate(sorted_screenshots):
                content = await f.read()
                ct = f.content_type or "image/png"
                # Always image_0.png, image_1.png, … — synthesis prompts tell the model to use those names;
                # using the browser filename would store a different key than the model emits (404 on read).
                blob_name = f"{gcs_prefix}/image_{i}.png"
                upload_file(blob_name, content, ct)
                mime = mime_map.get(ct, "image/png")
                part = await _upload_to_gemini(content, mime)
                parts.append(part)

        if not parts:
            raise HTTPException(status_code=400, detail="No media to process")

        _ensure_agent_path()
        client = genai.Client(api_key=GEMINI_API_KEY)
        if os.environ.get("ECHOPRISM_SYNTHESIS_LANGGRAPH", "1").lower() in (
            "1",
            "true",
            "yes",
        ):
            from echo_prism_agent.agent import synthesize_via_langgraph

            result = await synthesize_via_langgraph(client, parts, gcs_prefix=gcs_prefix)
        else:
            from echo_prism_agent.synthesis.pipeline import synthesize_workflow_from_media

            result = await synthesize_workflow_from_media(client, parts, storage_prefix=gcs_prefix)
        steps_raw = result.get("steps")
        if not isinstance(steps_raw, list):
            steps_raw = []
        steps_data = [s for s in steps_raw if isinstance(s, dict)]
        variables = result.get("variables", []) if isinstance(result.get("variables"), list) else []

        if len(steps_data) == 0:
            detail = (
                "Synthesis returned no steps. The recording may be unreadable, the model output was not "
                "valid JSON, or the Gemini API key / quota failed. Check agent logs (look for "
                "'Media synthesis JSON parse' or generate_content errors) and try again."
            )
            workflow_ref.update(
                {
                    "status": "failed",
                    "name": workflow_name or "Synthesis failed",
                    "error": detail,
                    "updatedAt": SERVER_TIMESTAMP,
                }
            )
            raise HTTPException(status_code=500, detail=detail)

        brand_domain = _brand_domain_from_steps(steps_data)

        if max_screenshot_index >= 0:
            if has_video and video_keyframe_upload_count > 0:
                cap_hi = _video_synthesis_max_image_index(steps_data, uploaded_max_index=max_screenshot_index)
                if cap_hi < max_screenshot_index:
                    n_steps = sum(1 for s in steps_data if isinstance(s, dict))
                    _log.info(
                        "video keyframe cap by step count uploaded=%s cap_hi=%s steps=%s",
                        video_keyframe_upload_count,
                        cap_hi,
                        n_steps,
                    )
                    _delete_extra_video_keyframes(
                        gcs_prefix,
                        keep_last_index=cap_hi,
                        total_uploaded=video_keyframe_upload_count,
                    )
                max_screenshot_index = cap_hi
                _clamp_synthesis_image_refs_in_steps(steps_data, hi=max_screenshot_index)
            else:
                _clamp_synthesis_image_refs_in_steps(steps_data, hi=max_screenshot_index)

            from echo_prism_agent.synthesis.pipeline import spread_collapsed_synthesis_keyframes

            spread_collapsed_synthesis_keyframes(steps_data, hi=max_screenshot_index)

        for i, s in enumerate(steps_data):
            step_id = str(uuid.uuid4())
            hydrated = _hydrate_step_dict(s, gcs_prefix)
            workflow_ref.collection("steps").document(step_id).set(_step_firestore_payload(i, hydrated))

        title = workflow_name or result.get("title") or "Untitled workflow"
        workflow_type = result.get("workflow_type", "browser")
        if workflow_type not in ("browser", "desktop"):
            workflow_type = "browser"

        from app.config import GCS_BUCKET as _GCS_BUCKET

        thumbnail_gcs_path: str | None = None
        if (not has_video and screenshots) or (has_video and max_screenshot_index >= 0):
            blob_name_thumb = f"{gcs_prefix}/image_0.png"
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
        if brand_domain:
            update_payload["brand_domain"] = brand_domain
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
    from echo_prism_agent.synthesis.pipeline import synthesize_workflow_from_description

    workflow_id = str(uuid.uuid4())
    workflow_ref = db.collection("workflows").document(workflow_id)
    normalized_wf_type = workflow_type if workflow_type in ("browser", "desktop") else "browser"
    payload: dict = {
        "name": name,
        "status": "processing",
        "owner_uid": uid,
        "workflow_type": normalized_wf_type,
        "createdAt": SERVER_TIMESTAMP,
        "updatedAt": SERVER_TIMESTAMP,
    }
    if ephemeral:
        payload["ephemeral"] = True
    workflow_ref.set(payload)
    client = genai.Client(api_key=GEMINI_API_KEY)
    result = await synthesize_workflow_from_description(description, name, normalized_wf_type, client)
    steps_raw = result.get("steps", [])
    if not isinstance(steps_raw, list):
        steps_raw = []
    steps_data = [s for s in steps_raw if isinstance(s, dict)]
    variables = result.get("variables", []) if isinstance(result.get("variables"), list) else []
    actual_type = result.get("workflow_type", normalized_wf_type)
    if actual_type not in ("browser", "desktop"):
        actual_type = "browser"

    if len(steps_data) == 0:
        detail = (
            "Description synthesis returned no steps. The model response may not have been valid JSON, "
            "or the Gemini API failed. Check agent logs and try again."
        )
        workflow_ref.update(
            {
                "status": "failed",
                "name": name,
                "error": detail,
                "updatedAt": SERVER_TIMESTAMP,
            }
        )
        raise RuntimeError(detail)

    folder_prefix = f"{uid}/{workflow_id}"
    brand_domain = _brand_domain_from_steps(steps_data)

    for i, s in enumerate(steps_data):
        step_id = str(uuid.uuid4())
        hydrated = _hydrate_step_dict(s, folder_prefix)
        workflow_ref.collection("steps").document(step_id).set(_step_firestore_payload(i, hydrated))

    update_desc: dict = {
        "name": result.get("title") or name,
        "workflow_type": actual_type,
        "status": "ready",
        "updatedAt": SERVER_TIMESTAMP,
        "variables": sorted(variables) if variables else [],
    }
    if brand_domain:
        update_desc["brand_domain"] = brand_domain
    workflow_ref.update(update_desc)
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
        workflow_id = await synthesize_from_description_impl(uid, body.name, body.description, body.workflow_type, db)
        return {"workflow_id": workflow_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
