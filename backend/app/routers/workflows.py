"""
Workflow and step CRUD: GET/POST /api/workflows, GET/PUT/DELETE /api/workflows/{id},
GET/POST /api/workflows/{id}/steps, PUT/DELETE /api/workflows/{id}/steps/{step_id}
"""

import logging
import re
import uuid
from typing import Any
from urllib.parse import unquote, urlparse

import firebase_admin.auth
import firebase_admin.firestore
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from google.api_core import exceptions as gcp_exceptions
from google.cloud.firestore import DELETE_FIELD, SERVER_TIMESTAMP, ArrayRemove, ArrayUnion, FieldFilter
from pydantic import BaseModel

from app.auth import get_current_uid, get_firebase_app
from app.config import FIREBASE_STORAGE_BUCKET, GCS_BUCKET

router = APIRouter(prefix="/workflows", tags=["workflows"])
_log = logging.getLogger(__name__)


def _validate_flow_graph_step_ids(wf_ref: Any, flow_graph: dict[str, Any]) -> None:
    """Ensure each graph node id references an existing step (Echo Flow M1)."""
    nodes = flow_graph.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        return
    step_ids = {d.id for d in wf_ref.collection("steps").stream()}
    for n in nodes:
        if not isinstance(n, dict):
            continue
        nid = n.get("id")
        if not isinstance(nid, str) or not nid:
            continue
        if nid not in step_ids:
            raise HTTPException(
                status_code=400,
                detail=f"flow_graph node id does not match a step: {nid}",
            )


def _get_workflow(uid: str, workflow_id: str, require_owner: bool = True) -> tuple[Any, Any]:
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    wf_ref = db.collection("workflows").document(workflow_id)
    doc = wf_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Workflow not found")
    data = doc.to_dict()
    is_owner = data.get("owner_uid") == uid
    is_shared = uid in (data.get("shared_with") or [])
    if require_owner and not is_owner:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not require_owner and not is_owner and not is_shared:
        raise HTTPException(status_code=403, detail="Forbidden")
    return wf_ref, data


def _collaborator_role(data: dict[str, Any], collaborator_uid: str) -> str:
    roles = data.get("collaborator_roles")
    if isinstance(roles, dict):
        raw = roles.get(collaborator_uid)
        if raw in ("viewer", "editor"):
            return raw
    return "editor"


def _assert_can_edit_workflow(uid: str, data: dict[str, Any]) -> None:
    """Owner or shared user with editor role may mutate workflow content."""
    if data.get("owner_uid") == uid:
        return
    if uid not in (data.get("shared_with") or []):
        raise HTTPException(status_code=403, detail="Forbidden")
    if _collaborator_role(data, uid) == "viewer":
        raise HTTPException(status_code=403, detail="View-only access")


def _context_media_allowed_buckets() -> set[str]:
    return {b for b in (GCS_BUCKET, FIREBASE_STORAGE_BUCKET) if b}


def _bucket_allows_read(bucket: str) -> bool:
    """Configured GCS bucket, explicit Firebase bucket env, or typical Firebase default buckets."""
    if not bucket:
        return False
    if bucket in _context_media_allowed_buckets():
        return True
    b = bucket.lower()
    if b.endswith(".appspot.com"):
        return True
    if b.endswith(".firebasestorage.app"):
        return True
    return False


def _allowed_context_blob_path(blob_name: str, workflow_id: str, owner_uid: str, request_uid: str) -> bool:
    bn = blob_name.strip().lstrip("/")
    if not bn or any(seg == ".." for seg in bn.split("/")):
        return False
    marker = f"/workflow-context/{workflow_id}/"
    if bn.startswith("uploads/") and marker in bn:
        parts = bn.split("/")
        if len(parts) < 3 or parts[0] != "uploads":
            return False
        upload_uid = parts[1]
        return bool(upload_uid) and upload_uid in (owner_uid, request_uid)
    prefix_syn = f"{owner_uid}/{workflow_id}/"
    return bn.startswith(prefix_syn)


def _parse_context_media_location(src: str) -> tuple[str, str] | None:
    """Return (bucket, object_path) for GCP / Firebase Storage, or None."""
    s = src.strip()
    if not s:
        return None

    if s.startswith("gs://"):
        m = re.match(r"^gs://([^/]+)/(.+)$", s)
        if not m:
            return None
        bucket, path = m.group(1), m.group(2)
        if not _bucket_allows_read(bucket):
            return None
        obj = unquote(path).lstrip("/")
        return (bucket, obj) if obj else None

    if "://" not in s and s.startswith("uploads/") and GCS_BUCKET:
        obj = unquote(s).lstrip("/")
        if obj:
            return (GCS_BUCKET, obj)

    try:
        u = urlparse(s)
    except Exception:
        return None

    host = (u.hostname or "").lower()

    if host == "firebasestorage.googleapis.com":
        m = re.match(r"/v0/b/([^/]+)/o/(.+)$", u.path)
        if not m:
            return None
        bucket, enc = m.group(1), m.group(2)
        if not _bucket_allows_read(bucket):
            return None
        obj = unquote(enc)
        return (bucket, obj) if obj else None

    # JSON API style: /download/storage/v1/b/BUCKET/o/ENCODED_OBJECT
    if host in ("storage.googleapis.com", "www.googleapis.com", "googleapis.com"):
        m_dl = re.match(r"^/download/storage/v1/b/([^/]+)/o/(.+)$", u.path)
        if m_dl:
            bucket, enc = m_dl.group(1), m_dl.group(2)
            if not _bucket_allows_read(bucket):
                return None
            obj = unquote(enc)
            return (bucket, obj) if obj else None
        m_api = re.match(r"^/storage/v1/b/([^/]+)/o/(.+)$", u.path)
        if m_api:
            bucket, enc = m_api.group(1), m_api.group(2)
            if not _bucket_allows_read(bucket):
                return None
            obj = unquote(enc)
            return (bucket, obj) if obj else None

    if host in ("storage.googleapis.com", "storage.cloud.google.com"):
        segs = u.path.lstrip("/").split("/", 1)
        if len(segs) >= 2:
            bucket, path = segs[0], segs[1]
            if _bucket_allows_read(bucket):
                obj = unquote(path).lstrip("/")
                if obj:
                    return (bucket, obj)

    if host.endswith(".storage.googleapis.com") and host not in (
        "storage.googleapis.com",
        "storage.cloud.google.com",
    ):
        bucket = host[: -len(".storage.googleapis.com")]
        if _bucket_allows_read(bucket):
            obj = unquote(u.path.lstrip("/"))
            if obj:
                return (bucket, obj)

    return None


def _firebase_bucket_read_aliases(bucket: str) -> list[str]:
    """
    Firebase default buckets often have two GCS ids (same objects): ``{id}.appspot.com`` and
    ``{id}.firebasestorage.app``. URLs may use one while uploads or the Storage client expect the other.
    """
    out = [bucket]
    bl = bucket.lower()
    if bl.endswith(".firebasestorage.app"):
        pid = bl[: -len(".firebasestorage.app")]
        if pid:
            out.append(f"{pid}.appspot.com")
    elif bl.endswith(".appspot.com"):
        pid = bl[: -len(".appspot.com")]
        if pid:
            out.append(f"{pid}.firebasestorage.app")
    return list(dict.fromkeys(out))


def _download_context_media_bytes(
    req_id: str,
    workflow_id: str,
    url_bucket: str,
    blob_path: str,
) -> tuple[bytes, str]:
    """
    Try the bucket from the URL, Firebase paired bucket names, then configured ECHO_GCS_BUCKET /
    ECHO_FIREBASE_STORAGE_BUCKET (with the same aliases) — synthesis and signed URLs can disagree
    on which bucket id is used for the same underlying bucket.
    """
    from app.services.gcs import download_from_bucket, list_blob_names_with_prefix

    order: list[str] = []
    for b in _firebase_bucket_read_aliases(url_bucket):
        order.append(b)
    if GCS_BUCKET:
        for b in _firebase_bucket_read_aliases(GCS_BUCKET):
            if b not in order:
                order.append(b)
    if FIREBASE_STORAGE_BUCKET:
        for b in _firebase_bucket_read_aliases(FIREBASE_STORAGE_BUCKET):
            if b not in order:
                order.append(b)

    last_nf: gcp_exceptions.NotFound | None = None
    tried: list[str] = []
    for b in order:
        tried.append(b)
        try:
            data = download_from_bucket(b, blob_path)
            if b != url_bucket:
                _log.info(
                    "context-media bucket_fallback req_id=%s workflow_id=%s url_bucket=%s resolved_bucket=%s",
                    req_id,
                    workflow_id,
                    url_bucket,
                    b,
                )
            return data, b
        except gcp_exceptions.NotFound as e:
            last_nf = e
            continue
    if last_nf is None:
        raise RuntimeError("context-media: no buckets attempted")

    # Synthesis sometimes cites image_K.png when only image_0..image_M exist (K > M). If any
    # image_*.png exists under the same folder, retry with the highest existing index ≤ K.
    m_img = re.match(r"^(.*)image_(\d+)\.png$", blob_path, flags=re.I)
    if m_img:
        folder_prefix, req_k = m_img.group(1), int(m_img.group(2))
        tail_re = re.compile(r"image_(\d+)\.png$", flags=re.I)
        max_idx = -1
        listing_bucket: str | None = None
        for b in order:
            try:
                names = list_blob_names_with_prefix(b, folder_prefix)
            except Exception:
                continue
            for name in names:
                tm = tail_re.search(name)
                if tm:
                    max_idx = max(max_idx, int(tm.group(1)))
            if max_idx >= 0:
                listing_bucket = b
                break
        if max_idx >= 0:
            use_k = min(req_k, max_idx)
            alt_path = f"{folder_prefix}image_{use_k}.png"
            if alt_path != blob_path:
                for b in order:
                    try:
                        data = download_from_bucket(b, alt_path)
                        _log.info(
                            "context-media image_index_clamped req_id=%s workflow_id=%s "
                            "requested_key_tail=%s clamped_key_tail=%s listing_bucket=%s read_bucket=%s",
                            req_id,
                            workflow_id,
                            blob_path[-120:] if len(blob_path) > 120 else blob_path,
                            alt_path[-120:] if len(alt_path) > 120 else alt_path,
                            listing_bucket,
                            b,
                        )
                        return data, b
                    except gcp_exceptions.NotFound:
                        continue

    _log.warning(
        "context-media tried_buckets req_id=%s workflow_id=%s buckets=%s blob_tail=%s",
        req_id,
        workflow_id,
        tried,
        blob_path[-200:] if len(blob_path) > 200 else blob_path,
    )
    raise last_nf


def _redact_context_media_src_for_log(src: str, max_len: int = 280) -> str:
    """Strip signed-URL secrets before logging."""
    t = (src or "").strip()
    t = re.sub(
        r"([?&])(token|X-Goog-Signature|X-Goog-Credential|X-Goog-Date|X-Goog-Expires)=[^&]*",
        r"\1\2=<redacted>",
        t,
        flags=re.I,
    )
    if len(t) > max_len:
        t = t[: max_len - 1] + "…"
    return t


def _media_type_for_context_blob(blob_path: str) -> str:
    lower = blob_path.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".gif"):
        return "image/gif"
    if lower.endswith((".jpg", ".jpeg", ".jfif")):
        return "image/jpeg"
    if lower.endswith((".heic", ".heif")):
        return "image/heic"
    if lower.endswith(".avif"):
        return "image/avif"
    if lower.endswith(".svg"):
        return "image/svg+xml"
    if lower.endswith(".mp4"):
        return "video/mp4"
    if lower.endswith(".webm"):
        return "video/webm"
    if lower.endswith(".mov"):
        return "video/quicktime"
    return "application/octet-stream"


# --- Workflow schemas ---
class WorkflowCreate(BaseModel):
    name: str | None = None


class WorkflowUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    ephemeral: bool | None = None
    # When True, invites and direct link sharing are allowed (owner-only update).
    is_public: bool | None = None


class WorkflowFlowUpdate(BaseModel):
    """React Flow graph JSON: nodes, edges, optional viewport (see Echo Flow editor)."""

    flow_graph: dict[str, Any]


class ContextMediaBody(BaseModel):
    """Original attachment URL or gs:// URI (POST body avoids very long signed URLs in query strings)."""

    src: str


class StepCreate(BaseModel):
    action: str = "wait"
    context: str = ""
    params: dict[str, Any] = {}
    expected_outcome: str = ""
    # Optional Scribe-style frame from synthesis (URL to screenshot).
    frame_image_url: str | None = None
    # Normalized or pixel bbox / click point for overlay in Echo Flow inspector.
    click_overlay: dict[str, Any] | None = None
    # Optional images/videos/files for step context (Echo Flow inspector).
    context_attachments: list[dict[str, Any]] | None = None
    # If set, new step is ordered immediately before this step (no client reorder round-trip).
    insert_before_step_id: str | None = None


class StepUpdate(BaseModel):
    action: str | None = None
    context: str | None = None
    params: dict[str, Any] | None = None
    expected_outcome: str | None = None
    order: int | None = None
    frame_image_url: str | None = None
    click_overlay: dict[str, Any] | None = None
    context_attachments: list[dict[str, Any]] | None = None


class ShareWorkflow(BaseModel):
    email: str
    role: str = "editor"


class ShareRoleUpdate(BaseModel):
    role: str


# --- Workflow endpoints ---
@router.get("")
async def list_workflows(uid: str = Depends(get_current_uid)):
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    # Owned workflows
    owned_docs = db.collection("workflows").where(filter=FieldFilter("owner_uid", "==", uid)).stream()
    items: dict[str, Any] = {}
    for d in owned_docs:
        data = d.to_dict() or {}
        if data.get("ephemeral") is not True:
            items[d.id] = {"id": d.id, **data}
    # Shared workflows (uid is in the shared_with array)
    shared_docs = db.collection("workflows").where(filter=FieldFilter("shared_with", "array_contains", uid)).stream()
    for d in shared_docs:
        if d.id not in items:
            data = d.to_dict() or {}
            if data.get("ephemeral") is not True:
                items[d.id] = {"id": d.id, **data}
    return {"workflows": list(items.values())}


@router.post("")
async def create_workflow(
    body: WorkflowCreate | None = None,
    uid: str = Depends(get_current_uid),
):
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    workflow_id = str(uuid.uuid4())
    ref = db.collection("workflows").document(workflow_id)
    ref.set(
        {
            "owner_uid": uid,
            "name": (body.name if body else None) or "Untitled workflow",
            "status": "draft",
            "is_public": False,
            "createdAt": SERVER_TIMESTAMP,
            "updatedAt": SERVER_TIMESTAMP,
        }
    )
    return {"id": workflow_id}


@router.get("/invites")
async def list_invites(uid: str = Depends(get_current_uid)):
    """Return pending workflow invites sent to the current user."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    docs = (
        db.collection("workflow_invites")
        .where(filter=FieldFilter("to_uid", "==", uid))
        .where(filter=FieldFilter("status", "==", "pending"))
        .stream()
    )
    invites = [{"id": d.id, **d.to_dict()} for d in docs]
    return {"invites": invites}


@router.get("/{workflow_id}")
async def get_workflow(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    _, data = _get_workflow(uid, workflow_id, require_owner=False)
    # Resolve owner display name
    owner_name = None
    owner_uid = data.get("owner_uid")
    if owner_uid:
        try:
            owner_user = firebase_admin.auth.get_user(owner_uid)
            owner_name = owner_user.display_name or owner_user.email or owner_uid
        except Exception:
            owner_name = owner_uid
    return {"id": workflow_id, "owner_name": owner_name, **data}


@router.put("/{workflow_id}")
async def update_workflow(
    workflow_id: str,
    body: WorkflowUpdate,
    uid: str = Depends(get_current_uid),
):
    wf_ref, data = _get_workflow(uid, workflow_id, require_owner=False)
    _assert_can_edit_workflow(uid, data)
    update: dict[str, Any] = {"updatedAt": SERVER_TIMESTAMP}
    if body.name is not None:
        update["name"] = body.name
    if body.status is not None:
        update["status"] = body.status
    if body.ephemeral is not None:
        update["ephemeral"] = body.ephemeral
    if body.is_public is not None:
        if data.get("owner_uid") != uid:
            raise HTTPException(status_code=403, detail="Only the owner can change visibility")
        update["is_public"] = bool(body.is_public)
    wf_ref.update(update)
    return {"ok": True}


@router.put("/{workflow_id}/flow")
async def update_workflow_flow(
    workflow_id: str,
    body: WorkflowFlowUpdate,
    uid: str = Depends(get_current_uid),
):
    """Persist Echo Flow canvas state (nodes/edges) on the workflow document."""
    wf_ref, data = _get_workflow(uid, workflow_id, require_owner=False)
    _assert_can_edit_workflow(uid, data)
    _validate_flow_graph_step_ids(wf_ref, body.flow_graph)
    wf_ref.update(
        {
            "flow_graph": body.flow_graph,
            "updatedAt": SERVER_TIMESTAMP,
        }
    )
    return {"ok": True}


@router.get("/{workflow_id}/thumbnail")
async def get_thumbnail(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    """Return a short-lived signed URL for the workflow's thumbnail image."""
    _, data = _get_workflow(uid, workflow_id, require_owner=False)
    gcs_path = data.get("thumbnail_gcs_path")
    if not gcs_path:
        raise HTTPException(status_code=404, detail="No thumbnail available")
    # Parse gs://bucket/blob-name
    match = re.match(r"gs://[^/]+/(.+)", gcs_path)
    if not match:
        raise HTTPException(status_code=500, detail="Invalid thumbnail path")
    blob_name = match.group(1)
    from app.services.gcs import generate_signed_read_url

    signed_url = generate_signed_read_url(blob_name, expiration_minutes=60)
    return {"url": signed_url}


@router.get("/{workflow_id}/thumbnail/image")
async def get_thumbnail_image(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    """
    Return raw thumbnail bytes (same auth as GET /thumbnail JSON).

    Use this from the web app with Bearer auth + blob URLs so thumbnails load in production
    without relying on browser loads of GCS signed URLs (Referrer/CORP/CORS edge cases).
    """
    _, data = _get_workflow(uid, workflow_id, require_owner=False)
    gcs_path = data.get("thumbnail_gcs_path")
    if not gcs_path:
        raise HTTPException(status_code=404, detail="No thumbnail available")
    match = re.match(r"gs://[^/]+/(.+)", gcs_path)
    if not match:
        raise HTTPException(status_code=500, detail="Invalid thumbnail path")
    blob_name = match.group(1)
    from app.services.gcs import download_file

    try:
        body = download_file(blob_name)
    except gcp_exceptions.NotFound as e:
        raise HTTPException(status_code=404, detail="Thumbnail blob not found") from e
    except Exception as e:
        _log.exception("Thumbnail download failed for workflow %s", workflow_id)
        raise HTTPException(status_code=500, detail="Could not load thumbnail") from e
    lower = blob_name.lower()
    media = "image/jpeg"
    if lower.endswith(".png"):
        media = "image/png"
    elif lower.endswith(".webp"):
        media = "image/webp"
    elif lower.endswith(".gif"):
        media = "image/gif"
    return Response(content=body, media_type=media)


@router.post("/{workflow_id}/context-media")
async def post_context_media(
    workflow_id: str,
    body: ContextMediaBody,
    uid: str = Depends(get_current_uid),
):
    """
    Return raw bytes for a step context attachment (same auth pattern as thumbnail/image).

    The web app uses this with Bearer + blob URLs because GCS signed URLs often fail when
    embedded in ``<img src>`` (Referrer / CORP / cross-origin). Firebase download URLs are
    usually loaded directly in the browser and do not need this endpoint.
    """
    req_id = uuid.uuid4().hex[:12]
    redacted_src = _redact_context_media_src_for_log(body.src or "")
    _log.info(
        "context-media start req_id=%s workflow_id=%s uid=%s src_len=%s src=%s",
        req_id,
        workflow_id,
        uid,
        len(body.src or ""),
        redacted_src,
    )
    try:
        _, data = _get_workflow(uid, workflow_id, require_owner=False)
    except HTTPException as e:
        if e.status_code == 404:
            _log.warning(
                "context-media workflow_not_found req_id=%s workflow_id=%s uid=%s",
                req_id,
                workflow_id,
                uid,
            )
        raise

    owner_uid = str(data.get("owner_uid") or "")
    if not owner_uid:
        _log.error("context-media missing_owner_uid req_id=%s workflow_id=%s", req_id, workflow_id)
        raise HTTPException(
            status_code=500,
            detail={"error": "invalid_workflow", "req_id": req_id, "message": "Workflow has no owner_uid"},
        )

    loc = _parse_context_media_location(body.src)
    if not loc:
        host = ""
        try:
            host = (urlparse((body.src or "").strip()).hostname or "") or ""
        except Exception:
            host = ""
        _log.warning(
            "context-media parse_failed req_id=%s workflow_id=%s uid=%s src_hostname=%r src=%s",
            req_id,
            workflow_id,
            uid,
            host,
            redacted_src,
        )
        raise HTTPException(
            status_code=400,
            detail={
                "error": "unsupported_media_url",
                "req_id": req_id,
                "message": "Could not parse storage URL (expected gs://, firebasestorage, or storage.googleapis.com)",
                "src_hostname": host or None,
            },
        )

    bucket, blob_path = loc
    if not _allowed_context_blob_path(blob_path, workflow_id, owner_uid, uid):
        tail = blob_path[-240:] if len(blob_path) > 240 else blob_path
        _log.warning(
            "context-media path_denied req_id=%s workflow_id=%s uid=%s owner_uid=%s bucket=%s blob_tail=%s",
            req_id,
            workflow_id,
            uid,
            owner_uid,
            bucket,
            tail,
        )
        raise HTTPException(
            status_code=403,
            detail={
                "error": "path_not_allowed",
                "req_id": req_id,
                "bucket": bucket,
                "object_key_tail": tail,
                "workflow_id": workflow_id,
                "message": "Object path is not allowed for this workflow (must be owner synthesis prefix or uploads/…/workflow-context/…/)",
            },
        )

    try:
        raw, resolved_bucket = _download_context_media_bytes(req_id, workflow_id, bucket, blob_path)
    except gcp_exceptions.NotFound:
        tail = blob_path[-240:] if len(blob_path) > 240 else blob_path
        _log.warning(
            "context-media gcs_not_found req_id=%s workflow_id=%s bucket=%s blob_tail=%s",
            req_id,
            workflow_id,
            bucket,
            tail,
        )
        raise HTTPException(
            status_code=404,
            detail={
                "error": "storage_object_not_found",
                "req_id": req_id,
                "bucket": bucket,
                "object_key_tail": tail,
                "message": "No object at this bucket/key (wrong URL, expired reference, or different GCP project than backend credentials)",
            },
        ) from None
    except Exception as e:
        _log.exception("context-media download_failed req_id=%s workflow_id=%s", req_id, workflow_id)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "download_failed",
                "req_id": req_id,
                "message": "Could not load media from storage",
            },
        ) from e

    media = _media_type_for_context_blob(blob_path)
    _log.info(
        "context-media ok req_id=%s workflow_id=%s bucket=%s bytes=%s",
        req_id,
        workflow_id,
        resolved_bucket,
        len(raw),
    )
    resp = Response(content=raw, media_type=media)
    resp.headers["X-Echo-Request-Id"] = req_id
    return resp


@router.post("/{workflow_id}/share")
async def share_workflow(
    workflow_id: str,
    body: ShareWorkflow,
    uid: str = Depends(get_current_uid),
):
    """Send a workflow invite to another user by email. Owner or collaborator with editor role."""
    wf_ref, wf_data = _get_workflow(uid, workflow_id, require_owner=False)
    _assert_can_edit_workflow(uid, wf_data)
    if wf_data.get("is_public") is not True:
        raise HTTPException(
            status_code=400,
            detail="Make this workflow public before inviting people or sharing the link.",
        )
    try:
        target_user = firebase_admin.auth.get_user_by_email(body.email)
    except firebase_admin.auth.UserNotFoundError:
        raise HTTPException(status_code=404, detail="No Echo account found for that email")
    if body.role not in ("viewer", "editor"):
        raise HTTPException(status_code=400, detail="role must be viewer or editor")
    if target_user.uid == uid:
        raise HTTPException(status_code=400, detail="Cannot share with yourself")
    if target_user.uid in (wf_data.get("shared_with") or []):
        raise HTTPException(status_code=400, detail="User already has access")
    # Prevent duplicate pending invites
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    existing = list(
        db.collection("workflow_invites")
        .where(filter=FieldFilter("workflow_id", "==", workflow_id))
        .where(filter=FieldFilter("to_uid", "==", target_user.uid))
        .where(filter=FieldFilter("status", "==", "pending"))
        .limit(1)
        .stream()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Invite already sent to this user")
    # Resolve sender display name and photo (for in-app notifications)
    try:
        sender = firebase_admin.auth.get_user(uid)
        from_name = sender.display_name or sender.email or uid
        from_photo = getattr(sender, "photo_url", None) or ""
        if not isinstance(from_photo, str):
            from_photo = ""
    except Exception:
        from_name = uid
        from_photo = ""
    invite_ref = db.collection("workflow_invites").document()
    invite_ref.set(
        {
            "workflow_id": workflow_id,
            "workflow_name": wf_data.get("name", "Untitled workflow"),
            "from_uid": uid,
            "from_name": from_name,
            "to_uid": target_user.uid,
            "to_email": target_user.email or body.email,
            "role": body.role,
            "status": "pending",
            "createdAt": SERVER_TIMESTAMP,
        }
    )
    # Create a notification for the recipient so they see it on the notifications page
    workflow_name = wf_data.get("name", "Untitled workflow")
    notif_ref = db.collection("notifications").document()
    notif_ref.set(
        {
            "to_uid": target_user.uid,
            "type": "workflow_shared",
            "title": "Workflow shared with you",
            "body": f'{from_name} shared the workflow "{workflow_name}" with you.',
            "workflow_id": workflow_id,
            "workflow_name": workflow_name,
            "from_uid": uid,
            "from_name": from_name,
            "from_photo_url": from_photo,
            "invite_id": invite_ref.id,
            "read": False,
            "createdAt": SERVER_TIMESTAMP,
        }
    )
    # Make invitees appear immediately in the owner's "Shared with" list.
    wf_ref.update(
        {
            "shared_with": ArrayUnion([target_user.uid]),
            f"collaborator_roles.{target_user.uid}": body.role,
            "updatedAt": SERVER_TIMESTAMP,
        }
    )
    return {"ok": True, "invite_id": invite_ref.id}


@router.post("/{workflow_id}/invite/accept")
async def accept_invite(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    """Accept a pending workflow invite: join the shared workflow for collaborative access (no automatic copy).

    Use POST /workflows/{id}/fork to create a separate owned copy when desired.
    """
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    invites = list(
        db.collection("workflow_invites")
        .where(filter=FieldFilter("workflow_id", "==", workflow_id))
        .where(filter=FieldFilter("to_uid", "==", uid))
        .where(filter=FieldFilter("status", "==", "pending"))
        .limit(1)
        .stream()
    )
    if not invites:
        raise HTTPException(status_code=404, detail="No pending invite found")
    invite_snap = invites[0]
    invite_ref = invite_snap.reference
    invite_data = invite_snap.to_dict() or {}
    wf_ref = db.collection("workflows").document(workflow_id)
    wf_doc = wf_ref.get()
    if not wf_doc.exists:
        raise HTTPException(status_code=404, detail="Source workflow no longer exists")
    wf_data = wf_doc.to_dict() or {}
    # Owner invite usually already added the recipient to shared_with; repair if missing.
    if uid not in (wf_data.get("shared_with") or []):
        role = invite_data.get("role") if invite_data.get("role") in ("viewer", "editor") else "editor"
        wf_ref.update(
            {
                "shared_with": ArrayUnion([uid]),
                f"collaborator_roles.{uid}": role,
                "updatedAt": SERVER_TIMESTAMP,
            }
        )
    invite_ref.update({"status": "accepted"})
    owner_uid = wf_data.get("owner_uid")
    if isinstance(owner_uid, str) and owner_uid and owner_uid != uid:
        try:
            accepter = firebase_admin.auth.get_user(uid)
            accepter_name = accepter.display_name or accepter.email or uid
            accepter_photo = getattr(accepter, "photo_url", None) or ""
            if not isinstance(accepter_photo, str):
                accepter_photo = ""
        except Exception:
            accepter_name = uid
            accepter_photo = ""
        wf_name = wf_data.get("name", "Untitled workflow")
        owner_notif = db.collection("notifications").document()
        owner_notif.set(
            {
                "to_uid": owner_uid,
                "type": "invite_accepted",
                "title": "Collaborator joined",
                "body": f'{accepter_name} accepted your invite to "{wf_name}".',
                "workflow_id": workflow_id,
                "workflow_name": wf_name,
                "from_uid": uid,
                "from_name": accepter_name,
                "from_photo_url": accepter_photo,
                "read": False,
                "createdAt": SERVER_TIMESTAMP,
            }
        )
    return {"ok": True, "workflow_id": workflow_id}


@router.post("/{workflow_id}/invite/decline")
async def decline_invite(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    """Decline a pending workflow invite. Recipient only."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    invites = list(
        db.collection("workflow_invites")
        .where(filter=FieldFilter("workflow_id", "==", workflow_id))
        .where(filter=FieldFilter("to_uid", "==", uid))
        .where(filter=FieldFilter("status", "==", "pending"))
        .limit(1)
        .stream()
    )
    if not invites:
        raise HTTPException(status_code=404, detail="No pending invite found")
    invite = invites[0]
    invite.reference.update({"status": "declined"})
    # If the inviter granted immediate visibility/access, remove it on decline.
    wf_ref = db.collection("workflows").document(workflow_id)
    wf_ref.update(
        {
            "shared_with": ArrayRemove([uid]),
            f"collaborator_roles.{uid}": DELETE_FIELD,
            "updatedAt": SERVER_TIMESTAMP,
        }
    )
    return {"ok": True}


@router.patch("/{workflow_id}/share/{target_uid}")
async def update_share_role(
    workflow_id: str,
    target_uid: str,
    body: ShareRoleUpdate,
    uid: str = Depends(get_current_uid),
):
    """Change a collaborator's role (owner only)."""
    if body.role not in ("viewer", "editor"):
        raise HTTPException(status_code=400, detail="role must be viewer or editor")
    wf_ref, wf_data = _get_workflow(uid, workflow_id)
    shared = wf_data.get("shared_with") or []
    if target_uid not in shared:
        raise HTTPException(status_code=404, detail="User is not a collaborator on this workflow")
    wf_ref.update(
        {
            f"collaborator_roles.{target_uid}": body.role,
            "updatedAt": SERVER_TIMESTAMP,
        }
    )
    return {"ok": True}


@router.post("/{workflow_id}/leave")
async def leave_workflow(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    """Remove yourself as a collaborator (non-owners only)."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    wf_ref = db.collection("workflows").document(workflow_id)
    wf_doc = wf_ref.get()
    if not wf_doc.exists:
        raise HTTPException(status_code=404, detail="Workflow not found")
    wf_data = wf_doc.to_dict() or {}
    owner = wf_data.get("owner_uid")
    if owner == uid:
        raise HTTPException(
            status_code=400,
            detail="Owners cannot leave their own workflow; delete it or remove collaborators instead.",
        )
    shared = wf_data.get("shared_with") or []
    if uid not in shared:
        raise HTTPException(status_code=404, detail="You are not a collaborator on this workflow")
    wf_ref.update(
        {
            "shared_with": ArrayRemove([uid]),
            f"collaborator_roles.{uid}": DELETE_FIELD,
            "updatedAt": SERVER_TIMESTAMP,
        }
    )
    pending_invites = (
        db.collection("workflow_invites")
        .where(filter=FieldFilter("workflow_id", "==", workflow_id))
        .where(filter=FieldFilter("to_uid", "==", uid))
        .where(filter=FieldFilter("status", "==", "pending"))
        .stream()
    )
    for inv in pending_invites:
        inv.reference.delete()
    return {"ok": True}


@router.delete("/{workflow_id}/share/{target_uid}")
async def unshare_workflow(
    workflow_id: str,
    target_uid: str,
    uid: str = Depends(get_current_uid),
):
    """Remove a user's access to a shared workflow. Owner only."""
    wf_ref, _ = _get_workflow(uid, workflow_id)
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    wf_ref.update(
        {
            "shared_with": ArrayRemove([target_uid]),
            f"collaborator_roles.{target_uid}": DELETE_FIELD,
            "updatedAt": SERVER_TIMESTAMP,
        }
    )
    # Also remove pending invites so the collaborator cannot reappear as "pending".
    pending_invites = (
        db.collection("workflow_invites")
        .where(filter=FieldFilter("workflow_id", "==", workflow_id))
        .where(filter=FieldFilter("to_uid", "==", target_uid))
        .where(filter=FieldFilter("status", "==", "pending"))
        .stream()
    )
    for invite_doc in pending_invites:
        invite_doc.reference.delete()
    return {"ok": True}


@router.get("/{workflow_id}/collaborators")
async def get_collaborators(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    """Return the list of users the workflow is shared with."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    _, data = _get_workflow(uid, workflow_id, require_owner=False)
    is_owner = data.get("owner_uid") == uid
    shared_uids: list[str] = data.get("shared_with") or []
    is_editor = uid in shared_uids and _collaborator_role(data, uid) == "editor"
    pending_uids: set[str] = set()
    if is_owner or is_editor:
        pending_invites = (
            db.collection("workflow_invites")
            .where(filter=FieldFilter("workflow_id", "==", workflow_id))
            .where(filter=FieldFilter("status", "==", "pending"))
            .stream()
        )
        for invite in pending_invites:
            invite_data = invite.to_dict() or {}
            invite_uid = invite_data.get("to_uid")
            if isinstance(invite_uid, str) and invite_uid:
                pending_uids.add(invite_uid)

    # Everyone with access: workflow owner first, then collaborators, then any pending-only uids.
    owner_uid = data.get("owner_uid")
    owner_str = owner_uid if isinstance(owner_uid, str) and owner_uid else None
    seen: set[str] = set()
    ordered_uids: list[str] = []

    def _push(u: str | None) -> None:
        if u and u not in seen:
            seen.add(u)
            ordered_uids.append(u)

    _push(owner_str)
    for u in shared_uids:
        _push(u)
    if is_owner or is_editor:
        for u in pending_uids:
            _push(u)

    collaborators = []
    for uid_row in ordered_uids:
        if owner_str and uid_row == owner_str:
            role_out: str = "owner"
        else:
            role_out = _collaborator_role(data, uid_row)
        status = "pending" if uid_row in pending_uids else "accepted"
        try:
            user = firebase_admin.auth.get_user(uid_row)
            photo = getattr(user, "photo_url", None)
            collaborators.append(
                {
                    "uid": uid_row,
                    "email": user.email or "",
                    "display_name": user.display_name or user.email or uid_row,
                    "photo_url": photo if isinstance(photo, str) and photo else "",
                    "status": status,
                    "role": role_out,
                }
            )
        except Exception:
            collaborators.append(
                {
                    "uid": uid_row,
                    "email": "",
                    "display_name": uid_row,
                    "photo_url": "",
                    "status": status,
                    "role": role_out,
                }
            )
    return {"collaborators": collaborators}


@router.post("/{workflow_id}/fork")
async def fork_workflow(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    """Create a copy of a workflow (owned by or shared with the caller)."""
    # Allow shared users to fork
    _, data = _get_workflow(uid, workflow_id, require_owner=False)
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    new_id = str(uuid.uuid4())
    new_ref = db.collection("workflows").document(new_id)
    base_name = (data.get("name") or "Untitled") or "Untitled"
    fork_payload: dict[str, Any] = {
        "owner_uid": uid,
        "name": f"{base_name} [COPY]",
        "status": "draft",
        "workflow_type": data.get("workflow_type", "browser"),
        "shared_with": [],
        "forked_from": workflow_id,
        "createdAt": SERVER_TIMESTAMP,
        "updatedAt": SERVER_TIMESTAMP,
    }
    if data.get("flow_graph") is not None:
        fork_payload["flow_graph"] = data.get("flow_graph")
    new_ref.set(fork_payload)
    # Copy all steps
    old_ref = db.collection("workflows").document(workflow_id)
    for step_doc in old_ref.collection("steps").order_by("order").stream():
        step_data = step_doc.to_dict() or {}
        new_ref.collection("steps").document(str(uuid.uuid4())).set(step_data)
    return {"id": new_id}


@router.delete("/{workflow_id}")
async def delete_workflow(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    wf_ref, _ = _get_workflow(uid, workflow_id)
    # Delete steps first
    for step in wf_ref.collection("steps").stream():
        step.reference.delete()
    wf_ref.delete()
    return {"ok": True}


# --- Step endpoints ---
@router.get("/{workflow_id}/steps")
async def list_steps(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    wf_ref, _ = _get_workflow(uid, workflow_id, require_owner=False)
    steps = []
    for d in wf_ref.collection("steps").order_by("order").stream():
        steps.append({"id": d.id, **d.to_dict()})
    return {"steps": steps}


@router.post("/{workflow_id}/steps")
async def create_step(
    workflow_id: str,
    body: StepCreate,
    uid: str = Depends(get_current_uid),
):
    wf_ref, data = _get_workflow(uid, workflow_id, require_owner=False)
    _assert_can_edit_workflow(uid, data)
    steps_col = wf_ref.collection("steps")
    step_id = str(uuid.uuid4())
    step_payload: dict[str, Any] = {
        "action": body.action,
        "context": body.context,
        "params": body.params,
        "expected_outcome": body.expected_outcome,
    }
    if body.frame_image_url is not None:
        step_payload["frame_image_url"] = body.frame_image_url
    if body.click_overlay is not None:
        step_payload["click_overlay"] = body.click_overlay
    if body.context_attachments is not None:
        step_payload["context_attachments"] = body.context_attachments

    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    batch = db.batch()

    insert_before = (body.insert_before_step_id or "").strip()
    placed = False
    if insert_before:
        ordered_docs = list(steps_col.order_by("order").stream())
        sorted_ids = [d.id for d in ordered_docs]
        if insert_before in sorted_ids:
            i = sorted_ids.index(insert_before)
            for j in range(i, len(sorted_ids)):
                batch.update(steps_col.document(sorted_ids[j]), {"order": j + 1})
            step_payload["order"] = i
            batch.set(steps_col.document(step_id), step_payload)
            placed = True

    if not placed:
        existing = list(steps_col.order_by("order", direction="DESCENDING").limit(1).stream())
        next_order = (existing[0].to_dict().get("order", -1) + 1) if existing else 0
        step_payload["order"] = next_order
        batch.set(steps_col.document(step_id), step_payload)

    batch.update(wf_ref, {"updatedAt": SERVER_TIMESTAMP})
    batch.commit()
    return {"id": step_id}


@router.put("/{workflow_id}/steps/{step_id}")
async def update_step(
    workflow_id: str,
    step_id: str,
    body: StepUpdate,
    uid: str = Depends(get_current_uid),
):
    wf_ref, data = _get_workflow(uid, workflow_id, require_owner=False)
    _assert_can_edit_workflow(uid, data)
    step_ref = wf_ref.collection("steps").document(step_id)
    doc = step_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Step not found")
    update: dict[str, Any] = {}
    if body.action is not None:
        update["action"] = body.action
    if body.context is not None:
        update["context"] = body.context
    if body.params is not None:
        update["params"] = body.params
    if body.expected_outcome is not None:
        update["expected_outcome"] = body.expected_outcome
    if body.order is not None:
        update["order"] = body.order
    if body.frame_image_url is not None:
        update["frame_image_url"] = body.frame_image_url
    if body.click_overlay is not None:
        update["click_overlay"] = body.click_overlay
    if body.context_attachments is not None:
        update["context_attachments"] = body.context_attachments
    if update:
        step_ref.update(update)
        wf_ref.update({"updatedAt": SERVER_TIMESTAMP})
    return {"ok": True}


@router.delete("/{workflow_id}/steps/{step_id}")
async def delete_step(
    workflow_id: str,
    step_id: str,
    uid: str = Depends(get_current_uid),
):
    wf_ref, data = _get_workflow(uid, workflow_id, require_owner=False)
    _assert_can_edit_workflow(uid, data)
    step_ref = wf_ref.collection("steps").document(step_id)
    doc = step_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Step not found")
    step_ref.delete()
    wf_ref.update({"updatedAt": SERVER_TIMESTAMP})
    return {"ok": True}
