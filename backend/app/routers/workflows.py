"""
Workflow and step CRUD: GET/POST /api/workflows, GET/PUT/DELETE /api/workflows/{id},
GET/POST /api/workflows/{id}/steps, PUT/DELETE /api/workflows/{id}/steps/{step_id},
PUT /api/workflows/{id}/steps/reorder
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
import firebase_admin.firestore
from google.cloud.firestore import SERVER_TIMESTAMP, FieldFilter
from pydantic import BaseModel

import re

from app.auth import get_current_uid, get_firebase_app

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _get_workflow(uid: str, workflow_id: str) -> tuple[Any, Any]:
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    wf_ref = db.collection("workflows").document(workflow_id)
    doc = wf_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Workflow not found")
    data = doc.to_dict()
    if data.get("owner_uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    return wf_ref, data


# --- Workflow schemas ---
class WorkflowCreate(BaseModel):
    name: str | None = None


class WorkflowUpdate(BaseModel):
    name: str | None = None
    status: str | None = None


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


# --- Workflow endpoints ---
@router.get("")
async def list_workflows(uid: str = Depends(get_current_uid)):
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    q = db.collection("workflows").where(filter=FieldFilter("owner_uid", "==", uid))
    docs = q.stream()
    items = [{"id": d.id, **d.to_dict()} for d in docs]
    return {"workflows": items}


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
        "name": (body.name if body else None) or f"Workflow {workflow_id[:8]}",
        "status": "draft",
        "createdAt": SERVER_TIMESTAMP,
        "updatedAt": SERVER_TIMESTAMP,
    })
    return {"id": workflow_id}


@router.get("/{workflow_id}")
async def get_workflow(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    _, data = _get_workflow(uid, workflow_id)
    return {"id": workflow_id, **data}


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
    wf_ref.update(update)
    return {"ok": True}


@router.get("/{workflow_id}/thumbnail")
async def get_thumbnail(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    """Return a short-lived signed URL for the workflow's thumbnail image."""
    _, data = _get_workflow(uid, workflow_id)
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
    wf_ref, _ = _get_workflow(uid, workflow_id)
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
