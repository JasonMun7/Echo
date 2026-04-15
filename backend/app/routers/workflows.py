"""
Workflow and step CRUD: GET/POST /api/workflows, GET/PUT/DELETE /api/workflows/{id},
GET/POST /api/workflows/{id}/steps, PUT/DELETE /api/workflows/{id}/steps/{step_id}
"""

import logging
import re
import uuid
from typing import Any

import firebase_admin.auth
import firebase_admin.firestore
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from google.api_core import exceptions as gcp_exceptions
from google.cloud.firestore import DELETE_FIELD, SERVER_TIMESTAMP, ArrayRemove, ArrayUnion, FieldFilter
from pydantic import BaseModel

from app.auth import get_current_uid, get_firebase_app

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
