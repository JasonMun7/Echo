"""
Run endpoints: GET /api/workflows/{id}/runs, GET /api/workflows/{id}/runs/{run_id},
POST /api/run/{workflow_id}, PUT /api/run/{workflow_id}/{run_id}/confirm,
DELETE /api/run/{workflow_id}/{run_id}, POST /api/run/{workflow_id}/{run_id}/redirect,
POST /api/run/{workflow_id}/{run_id}/dismiss
"""
import logging
import os
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
import firebase_admin.firestore
from google.cloud.firestore import SERVER_TIMESTAMP

from app.auth import get_current_uid, get_firebase_app
from app.routers.workflows import _get_workflow

router = APIRouter(tags=["runs"])


@router.get("/workflows/{workflow_id}/runs")
async def list_runs(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    _get_workflow(uid, workflow_id)
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    runs_ref = db.collection("workflows").document(workflow_id).collection("runs")
    docs = runs_ref.order_by("createdAt", direction="DESCENDING").limit(50).stream()
    items = [{"id": d.id, **d.to_dict()} for d in docs]
    return {"runs": items}


@router.get("/workflows/{workflow_id}/runs/{run_id}")
async def get_run(
    workflow_id: str,
    run_id: str,
    uid: str = Depends(get_current_uid),
):
    _get_workflow(uid, workflow_id)
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
    doc = run_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"id": doc.id, **doc.to_dict()}


@router.post("/run/{workflow_id}")
async def create_run(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    wf_ref, _ = _get_workflow(uid, workflow_id)
    run_id = str(uuid.uuid4())
    run_ref = wf_ref.collection("runs").document(run_id)
    run_ref.set({
        "status": "pending",
        "owner_uid": uid,
        "createdAt": SERVER_TIMESTAMP,
        "confirmation_status": None,
    })

    # Trigger Cloud Run Job when available; fall back to in-process execution for local dev
    job_name = os.environ.get("RUN_JOB_NAME", "")
    project = (
        os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCP_PROJECT")
        or os.environ.get("ECHO_GCP_PROJECT_ID")
    )
    region = (
        os.environ.get("CLOUD_RUN_REGION")
        or os.environ.get("ECHO_CLOUD_RUN_REGION")
        or "us-central1"
    )
    logger.info(
        "create_run: project=%s region=%s job_name=%s workflow_id=%s run_id=%s",
        project or "(none)",
        region,
        job_name or "(none)",
        workflow_id,
        run_id,
    )

    if project and job_name:
        # --- Cloud Run Job path (production) ---
        try:
            from google.cloud.run_v2 import JobsClient
            from google.cloud.run_v2.types import EnvVar, RunJobRequest
            client = JobsClient()
            job_path = f"projects/{project}/locations/{region}/jobs/{job_name}"
            logger.info("Invoking Cloud Run Job: %s", job_path)
            overrides = RunJobRequest.Overrides(container_overrides=[
                RunJobRequest.Overrides.ContainerOverride(env=[
                    EnvVar(name="WORKFLOW_ID", value=workflow_id),
                    EnvVar(name="RUN_ID", value=run_id),
                    EnvVar(name="OWNER_UID", value=uid),
                ])
            ])
            client.run_job(request=RunJobRequest(name=job_path, overrides=overrides))
            run_ref.update({"status": "running"})
            logger.info("Job invoked successfully, run status updated to running")
        except Exception as e:
            logger.exception("Failed to invoke job: %s", e)
            run_ref.update({"status": "failed", "error": str(e)})
    else:
        # --- Local dev path: run the agent in a background thread ---
        logger.info("No Cloud Run job configured — running agent in-process (local dev)")
        import threading
        import sys

        # Capture loop vars for the closure
        _workflow_id = workflow_id
        _run_id = run_id
        _uid = uid

        def _run_in_thread():
            # Set env vars for this run (safe for single-run-at-a-time local dev)
            os.environ["WORKFLOW_ID"] = _workflow_id
            os.environ["RUN_ID"] = _run_id
            os.environ["OWNER_UID"] = _uid
            # Add backend/agent to sys.path so imports resolve
            agent_dir = os.path.normpath(
                os.path.join(os.path.dirname(__file__), "..", "..", "agent")
            )
            if agent_dir not in sys.path:
                sys.path.insert(0, agent_dir)
            try:
                from run_workflow_agent import main as agent_main
                agent_main()
            except Exception as exc:
                logger.exception("In-process agent failed: %s", exc)
                try:
                    run_ref.update({"status": "failed", "error": str(exc)})
                except Exception:
                    pass

        t = threading.Thread(target=_run_in_thread, daemon=True, name=f"agent-{run_id[:8]}")
        t.start()

    return {"run_id": run_id, "workflow_id": workflow_id}


@router.put("/run/{workflow_id}/{run_id}/confirm")
async def confirm_run(
    workflow_id: str,
    run_id: str,
    uid: str = Depends(get_current_uid),
):
    wf_ref, _ = _get_workflow(uid, workflow_id)
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
    wf_ref, _ = _get_workflow(uid, workflow_id)
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
    wf_ref, _ = _get_workflow(uid, workflow_id)
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


@router.post("/run/{workflow_id}/{run_id}/dismiss")
async def dismiss_calluser(
    workflow_id: str,
    run_id: str,
    uid: str = Depends(get_current_uid),
):
    """Dismiss an awaiting_user run (user has resolved the issue manually).
    Marks the run as completed so the frontend moves to the log view.
    """
    wf_ref, _ = _get_workflow(uid, workflow_id)
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
