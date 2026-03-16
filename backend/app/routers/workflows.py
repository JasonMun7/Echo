"""
Workflow and step CRUD: GET/POST /api/workflows, GET/PUT/DELETE /api/workflows/{id},
GET/POST /api/workflows/{id}/steps, PUT/DELETE /api/workflows/{id}/steps/{step_id},
PUT /api/workflows/{id}/steps/reorder
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
import firebase_admin.auth
import firebase_admin.firestore
from google.cloud.firestore import SERVER_TIMESTAMP, ArrayUnion, ArrayRemove, FieldFilter
from pydantic import BaseModel

import re

from app.auth import get_current_uid, get_firebase_app

router = APIRouter(prefix="/workflows", tags=["workflows"])


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


# --- Workflow schemas ---
class WorkflowCreate(BaseModel):
    name: str | None = None


class WorkflowUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    ephemeral: bool | None = None


class StepCreate(BaseModel):
    action: str = "wait"
    context: str = ""
    params: dict[str, Any] = {}
    expected_outcome: str = ""


class StepUpdate(BaseModel):
    action: str | None = None
    context: str | None = None
    params: dict[str, Any] | None = None
    expected_outcome: str | None = None
    order: int | None = None


class ReorderSteps(BaseModel):
    step_ids: list[str]


class ShareWorkflow(BaseModel):
    email: str


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
    ref.set({
        "owner_uid": uid,
        "name": (body.name if body else None) or "Untitled workflow",
        "status": "draft",
        "createdAt": SERVER_TIMESTAMP,
        "updatedAt": SERVER_TIMESTAMP,
    })
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
    wf_ref, _ = _get_workflow(uid, workflow_id)
    update: dict[str, Any] = {"updatedAt": SERVER_TIMESTAMP}
    if body.name is not None:
        update["name"] = body.name
    if body.status is not None:
        update["status"] = body.status
    if body.ephemeral is not None:
        update["ephemeral"] = body.ephemeral
    wf_ref.update(update)
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


@router.post("/{workflow_id}/share")
async def share_workflow(
    workflow_id: str,
    body: ShareWorkflow,
    uid: str = Depends(get_current_uid),
):
    """Send a workflow invite to another user by email. Owner only."""
    wf_ref, wf_data = _get_workflow(uid, workflow_id)
    try:
        target_user = firebase_admin.auth.get_user_by_email(body.email)
    except firebase_admin.auth.UserNotFoundError:
        raise HTTPException(status_code=404, detail="No Echo account found for that email")
    if target_user.uid == uid:
        raise HTTPException(status_code=400, detail="Cannot share with yourself")
    # Prevent duplicate pending invites
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    existing = (
        db.collection("workflow_invites")
        .where(filter=FieldFilter("workflow_id", "==", workflow_id))
        .where(filter=FieldFilter("to_uid", "==", target_user.uid))
        .where(filter=FieldFilter("status", "==", "pending"))
        .limit(1)
        .stream()
    )
    if any(True for _ in existing):
        raise HTTPException(status_code=400, detail="Invite already sent to this user")
    # Resolve sender display name
    try:
        sender = firebase_admin.auth.get_user(uid)
        from_name = sender.display_name or sender.email or uid
    except Exception:
        from_name = uid
    invite_ref = db.collection("workflow_invites").document()
    invite_ref.set({
        "workflow_id": workflow_id,
        "workflow_name": wf_data.get("name", "Untitled workflow"),
        "from_uid": uid,
        "from_name": from_name,
        "to_uid": target_user.uid,
        "to_email": target_user.email or body.email,
        "status": "pending",
        "createdAt": SERVER_TIMESTAMP,
    })
    return {"ok": True, "invite_id": invite_ref.id}


@router.post("/{workflow_id}/invite/accept")
async def accept_invite(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    """Accept a pending workflow invite. Forks the workflow for the recipient so they own their own copy."""
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
    invite_ref = invites[0].reference
    # Fork the source workflow so the recipient owns their own copy
    wf_ref = db.collection("workflows").document(workflow_id)
    wf_doc = wf_ref.get()
    if not wf_doc.exists:
        raise HTTPException(status_code=404, detail="Source workflow no longer exists")
    wf_data = wf_doc.to_dict() or {}
    new_id = str(uuid.uuid4())
    new_ref = db.collection("workflows").document(new_id)
    new_ref.set({
        "owner_uid": uid,
        "name": wf_data.get("name", "Untitled"),
        "status": wf_data.get("status", "draft"),
        "workflow_type": wf_data.get("workflow_type", "desktop"),
        "shared_with": [],
        "forked_from": workflow_id,
        "thumbnail_gcs_path": wf_data.get("thumbnail_gcs_path"),
        "createdAt": SERVER_TIMESTAMP,
        "updatedAt": SERVER_TIMESTAMP,
    })
    for step_doc in wf_ref.collection("steps").order_by("order").stream():
        step_data = step_doc.to_dict() or {}
        new_ref.collection("steps").document(str(uuid.uuid4())).set(step_data)
    invite_ref.update({"status": "accepted", "fork_id": new_id})
    return {"ok": True, "fork_id": new_id}


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
    invites[0].reference.update({"status": "declined"})
    return {"ok": True}


@router.delete("/{workflow_id}/share/{target_uid}")
async def unshare_workflow(
    workflow_id: str,
    target_uid: str,
    uid: str = Depends(get_current_uid),
):
    """Remove a user's access to a shared workflow. Owner only."""
    wf_ref, _ = _get_workflow(uid, workflow_id)
    wf_ref.update({"shared_with": ArrayRemove([target_uid]), "updatedAt": SERVER_TIMESTAMP})
    return {"ok": True}


@router.get("/{workflow_id}/collaborators")
async def get_collaborators(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    """Return the list of users the workflow is shared with."""
    _, data = _get_workflow(uid, workflow_id, require_owner=False)
    shared_uids: list[str] = data.get("shared_with") or []
    collaborators = []
    for shared_uid in shared_uids:
        try:
            user = firebase_admin.auth.get_user(shared_uid)
            collaborators.append({
                "uid": shared_uid,
                "email": user.email or "",
                "display_name": user.display_name or user.email or shared_uid,
            })
        except Exception:
            collaborators.append({"uid": shared_uid, "email": "", "display_name": shared_uid})
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
    new_ref.set({
        "owner_uid": uid,
        "name": f"{data.get('name', 'Untitled')} (copy)",
        "status": "draft",
        "workflow_type": data.get("workflow_type", "browser"),
        "shared_with": [],
        "forked_from": workflow_id,
        "createdAt": SERVER_TIMESTAMP,
        "updatedAt": SERVER_TIMESTAMP,
    })
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
    wf_ref, _ = _get_workflow(uid, workflow_id)
    # Get max order
    existing = list(wf_ref.collection("steps").order_by("order", direction="DESCENDING").limit(1).stream())
    next_order = (existing[0].to_dict().get("order", -1) + 1) if existing else 0
    step_id = str(uuid.uuid4())
    wf_ref.collection("steps").document(step_id).set({
        "order": next_order,
        "action": body.action,
        "context": body.context,
        "params": body.params,
        "expected_outcome": body.expected_outcome,
    })
    wf_ref.update({"updatedAt": SERVER_TIMESTAMP})
    return {"id": step_id}


@router.put("/{workflow_id}/steps/reorder")
async def reorder_steps(
    workflow_id: str,
    body: ReorderSteps,
    uid: str = Depends(get_current_uid),
):
    wf_ref, _ = _get_workflow(uid, workflow_id)
    for i, step_id in enumerate(body.step_ids):
        step_ref = wf_ref.collection("steps").document(step_id)
        if step_ref.get().exists:
            step_ref.update({"order": i})
    wf_ref.update({"updatedAt": SERVER_TIMESTAMP})
    return {"ok": True}


@router.put("/{workflow_id}/steps/{step_id}")
async def update_step(
    workflow_id: str,
    step_id: str,
    body: StepUpdate,
    uid: str = Depends(get_current_uid),
):
    wf_ref, _ = _get_workflow(uid, workflow_id)
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
    wf_ref, _ = _get_workflow(uid, workflow_id)
    step_ref = wf_ref.collection("steps").document(step_id)
    doc = step_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Step not found")
    step_ref.delete()
    wf_ref.update({"updatedAt": SERVER_TIMESTAMP})
    return {"ok": True}
