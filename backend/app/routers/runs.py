"""
Run endpoints: GET /api/workflows/{id}/runs, GET /api/workflows/{id}/runs/{run_id},
POST /api/run/{workflow_id}, PUT /api/run/{workflow_id}/{run_id}/confirm,
DELETE /api/run/{workflow_id}/{run_id}
"""
import logging
import os
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

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

    # Trigger Cloud Run Job when RUN_JOB_NAME and project/region are set
    job_name = os.environ.get("RUN_JOB_NAME", "echo-agent")
    project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCP_PROJECT")
    region = os.environ.get("CLOUD_RUN_REGION", "us-central1")
    logger.info(
        "create_run: project=%s region=%s job_name=%s workflow_id=%s run_id=%s",
        project or "(none)",
        region,
        job_name,
        workflow_id,
        run_id,
    )
    if not project or not job_name:
        logger.warning("Skipping job trigger: GOOGLE_CLOUD_PROJECT or RUN_JOB_NAME not set")
    else:
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
        "updatedAt": SERVER_TIMESTAMP,
    })
    return {"ok": True}
