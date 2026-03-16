"""
Run endpoints: GET /api/workflows/{id}/runs, GET /api/workflows/{id}/runs/{run_id},
POST /api/run/{workflow_id}, PUT /api/run/{workflow_id}/{run_id}/confirm,
DELETE /api/run/{workflow_id}/{run_id}, POST /api/run/{workflow_id}/{run_id}/redirect,
POST /api/run/{workflow_id}/{run_id}/dismiss
"""
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
import firebase_admin.firestore
from google.cloud.firestore import DELETE_FIELD, SERVER_TIMESTAMP, FieldFilter

from app.auth import get_current_uid, get_firebase_app
from app.routers.workflows import _get_workflow

router = APIRouter(tags=["runs"])


class PatchRunBody(BaseModel):
    status: str
    callUserReason: str | None = None
    error: str | None = None

    class Config:
        extra = "ignore"


@router.patch("/workflows/{workflow_id}/runs/{run_id}")
async def patch_run(
    workflow_id: str,
    run_id: str,
    body: PatchRunBody,
    uid: str = Depends(get_current_uid),
):
    """Update run status (used by desktop agent to sync progress)."""
    wf_ref, _ = _get_workflow(uid, workflow_id, require_owner=False)
    run_ref = wf_ref.collection("runs").document(run_id)
    doc = run_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    updates: dict[str, Any] = {"status": body.status, "updatedAt": SERVER_TIMESTAMP}
    if body.status == "completed":
        updates["completedAt"] = SERVER_TIMESTAMP
    if body.callUserReason is not None:
        updates["callUserReason"] = body.callUserReason
    if body.error is not None:
        updates["error"] = body.error
    if body.status == "failed":
        updates["completedAt"] = SERVER_TIMESTAMP
    run_ref.update(updates)
    return {"ok": True}


@router.get("/workflows/{workflow_id}/runs")
async def list_runs(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    _get_workflow(uid, workflow_id, require_owner=False)
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    runs_ref = db.collection("workflows").document(workflow_id).collection("runs")
    docs = runs_ref.order_by("createdAt", direction="DESCENDING").limit(50).stream()
    items = [{"id": d.id, **d.to_dict()} for d in docs]
    return {"runs": items}


@router.get("/run/{workflow_id}/{run_id}/poll-signals")
async def poll_run_signals(
    workflow_id: str,
    run_id: str,
    uid: str = Depends(get_current_uid),
):
    """Poll for redirect/cancel/calluser_feedback. Used by desktop agent between steps. Returns and clears redirect_instruction and calluser_feedback."""
    wf_ref, _ = _get_workflow(uid, workflow_id, require_owner=False)
    run_ref = wf_ref.collection("runs").document(run_id)
    doc = run_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    data = doc.to_dict() or {}
    if data.get("owner_uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    redirect_instruction = data.get("redirect_instruction")
    calluser_feedback = data.get("calluser_feedback")
    cancel_requested = data.get("cancel_requested", False)
    updates: dict[str, Any] = {"updatedAt": SERVER_TIMESTAMP}
    if redirect_instruction is not None:
        updates["redirect_instruction"] = DELETE_FIELD
        updates["redirect_acknowledged_at"] = SERVER_TIMESTAMP
    if calluser_feedback is not None:
        updates["calluser_feedback"] = DELETE_FIELD
        updates["calluser_feedback_ack_at"] = SERVER_TIMESTAMP
    if updates:
        run_ref.update(updates)
    return {
        "redirect_instruction": redirect_instruction,
        "calluser_feedback": calluser_feedback,
        "cancel_requested": cancel_requested,
    }


@router.get("/workflows/{workflow_id}/runs/{run_id}")
async def get_run(
    workflow_id: str,
    run_id: str,
    uid: str = Depends(get_current_uid),
):
    _get_workflow(uid, workflow_id, require_owner=False)
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
    doc = run_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"id": doc.id, **doc.to_dict()}


ACTIVE_RUN_STATUSES = ("running", "pending", "awaiting_user")


def _cancel_other_active_runs_for_user(uid: str) -> None:
    """Cancel all runs owned by this user that are running, pending, or awaiting_user."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    active = (
        db.collection_group("runs")
        .where(filter=FieldFilter("owner_uid", "==", uid))
        .where(filter=FieldFilter("status", "in", list(ACTIVE_RUN_STATUSES)))
        .stream()
    )
    for doc in active:
        try:
            doc.reference.update({
                "status": "cancelled",
                "cancel_requested": True,
                "completedAt": SERVER_TIMESTAMP,
                "updatedAt": SERVER_TIMESTAMP,
            })
            logger.info("Cancelled prior active run %s for user %s", doc.id, uid)
        except Exception as e:
            logger.warning("Failed to cancel run %s: %s", doc.id, e)


@router.post("/run/{workflow_id}")
async def create_run(
    workflow_id: str,
    source: str | None = None,
    uid: str = Depends(get_current_uid),
):
    """Create a run. Only source=desktop is supported (desktop runs locally).
    Any other active run owned by this user is cancelled first (one run at a time per user).
    """
    if source != "desktop":
        raise HTTPException(
            status_code=400,
            detail="Only source=desktop is supported. Provide ?source=desktop",
        )
    _cancel_other_active_runs_for_user(uid)
    wf_ref, _ = _get_workflow(uid, workflow_id, require_owner=False)
    run_id = str(uuid.uuid4())
    run_ref = wf_ref.collection("runs").document(run_id)
    run_ref.set({
        "status": "running",
        "owner_uid": uid,
        "createdAt": SERVER_TIMESTAMP,
        "confirmation_status": None,
        "source": "desktop",
    })
    return {"run_id": run_id, "workflow_id": workflow_id}


@router.put("/run/{workflow_id}/{run_id}/confirm")
async def confirm_run(
    workflow_id: str,
    run_id: str,
    uid: str = Depends(get_current_uid),
):
    wf_ref, _ = _get_workflow(uid, workflow_id, require_owner=False)
    run_ref = wf_ref.collection("runs").document(run_id)
    doc = run_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    run_ref.update({
        "confirmation_status": "confirmed",
        "updatedAt": SERVER_TIMESTAMP,
    })
    return {"ok": True}


@router.delete("/run/{workflow_id}/{run_id}")
async def cancel_run(
    workflow_id: str,
    run_id: str,
    uid: str = Depends(get_current_uid),
):
    wf_ref, _ = _get_workflow(uid, workflow_id, require_owner=False)
    run_ref = wf_ref.collection("runs").document(run_id)
    doc = run_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    run_ref.update({
        "status": "cancelled",
        "cancel_requested": True,
        "completedAt": SERVER_TIMESTAMP,
        "updatedAt": SERVER_TIMESTAMP,
    })
    return {"ok": True}


class RedirectBody(BaseModel):
    instruction: str


@router.post("/run/{workflow_id}/{run_id}/redirect")
async def redirect_run(
    workflow_id: str,
    run_id: str,
    body: RedirectBody,
    uid: str = Depends(get_current_uid),
):
    """Inject a mid-run redirect instruction for the agent to pick up between steps."""
    wf_ref, _ = _get_workflow(uid, workflow_id, require_owner=False)
    run_ref = wf_ref.collection("runs").document(run_id)
    doc = run_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    data = doc.to_dict() or {}
    if data.get("owner_uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    if data.get("status") != "running":
        raise HTTPException(status_code=400, detail="Run is not active")
    run_ref.update({
        "redirect_instruction": body.instruction,
        "redirect_at": SERVER_TIMESTAMP,
    })
    return {"ok": True}


class CallUserFeedbackBody(BaseModel):
    instruction: str


@router.post("/run/{workflow_id}/{run_id}/calluser-feedback")
async def calluser_feedback(
    workflow_id: str,
    run_id: str,
    body: CallUserFeedbackBody,
    uid: str = Depends(get_current_uid),
):
    """Send feedback when run is awaiting_user; stores instruction and sets status to running for agent to resume with."""
    wf_ref, _ = _get_workflow(uid, workflow_id, require_owner=False)
    run_ref = wf_ref.collection("runs").document(run_id)
    doc = run_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    data = doc.to_dict() or {}
    if data.get("owner_uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    if data.get("status") != "awaiting_user":
        raise HTTPException(status_code=400, detail="Run is not awaiting_user")
    run_ref.update({
        "calluser_feedback": body.instruction,
        "calluser_feedback_at": SERVER_TIMESTAMP,
        "status": "running",
        "updatedAt": SERVER_TIMESTAMP,
    })
    return {"ok": True}


@router.post("/run/{workflow_id}/{run_id}/dismiss")
async def dismiss_calluser(
    workflow_id: str,
    run_id: str,
    uid: str = Depends(get_current_uid),
):
    """Dismiss an awaiting_user run (user has resolved the issue manually).
    Marks the run as completed so the frontend moves to the log view.
    """
    wf_ref, _ = _get_workflow(uid, workflow_id, require_owner=False)
    run_ref = wf_ref.collection("runs").document(run_id)
    doc = run_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    data = doc.to_dict() or {}
    if data.get("status") != "awaiting_user":
        raise HTTPException(status_code=400, detail="Run is not awaiting_user")
    run_ref.update({
        "status": "completed",
        "callUserDismissedAt": SERVER_TIMESTAMP,
        "updatedAt": SERVER_TIMESTAMP,
    })
    return {"ok": True}
