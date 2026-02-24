"""
Schedule endpoints: POST/PUT/DELETE /api/schedule/{workflow_id}
Uses Cloud Scheduler; OIDC verification for scheduler-triggered runs.
"""
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_uid
from app.routers.workflows import _get_workflow

router = APIRouter(prefix="/schedule", tags=["schedule"])


class ScheduleBody(BaseModel):
    cron: str
    timezone: str = "UTC"


def _get_scheduler_client():
    try:
        from google.cloud.scheduler_v1 import CloudSchedulerClient
        from google.cloud.scheduler_v1 import Job, HttpTarget, OidcToken
        return CloudSchedulerClient(), Job, HttpTarget, OidcToken
    except ImportError:
        return None


@router.post("/{workflow_id}")
async def create_or_update_schedule(
    workflow_id: str,
    body: ScheduleBody,
    uid: str = Depends(get_current_uid),
):
    _get_workflow(uid, workflow_id)
    project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCP_PROJECT")
    location = os.environ.get("SCHEDULER_LOCATION", "us-central1")
    if not project:
        raise HTTPException(status_code=500, detail="GOOGLE_CLOUD_PROJECT not set")
    result = _get_scheduler_client()
    if not result:
        raise HTTPException(status_code=501, detail="Cloud Scheduler not available")
    client, Job, HttpTarget, OidcToken = result
    job_name = f"echo-workflow-{workflow_id[:8]}"
    api_url = os.environ.get("BACKEND_URL", "https://your-backend.run.app")
    sa_email = os.environ.get("SCHEDULER_SA_EMAIL", "")
    job = Job(
        name=client.job_path(project, location, job_name),
        schedule=body.cron,
        time_zone=body.timezone,
        http_target=HttpTarget(
            uri=f"{api_url}/api/run/{workflow_id}",
            http_method="POST",
            oidc_token=OidcToken(service_account_email=sa_email) if sa_email else None,
        ),
    )
    try:
        client.create_job(parent=client.location_path(project, location), job=job)
    except Exception as e:
        if "already exists" in str(e).lower() or "409" in str(e):
            client.update_job(job=job)
        else:
            raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True, "job": job_name}


@router.put("/{workflow_id}")
async def update_schedule(
    workflow_id: str,
    body: ScheduleBody,
    uid: str = Depends(get_current_uid),
):
    return await create_or_update_schedule(workflow_id, body, uid)


@router.delete("/{workflow_id}")
async def delete_schedule(
    workflow_id: str,
    uid: str = Depends(get_current_uid),
):
    _get_workflow(uid, workflow_id)
    project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCP_PROJECT")
    location = os.environ.get("SCHEDULER_LOCATION", "us-central1")
    if not project:
        raise HTTPException(status_code=500, detail="GOOGLE_CLOUD_PROJECT not set")
    result = _get_scheduler_client()
    if not result:
        raise HTTPException(status_code=501, detail="Cloud Scheduler not available")
    client = result[0]
    job_name = f"echo-workflow-{workflow_id[:8]}"
    name = client.job_path(project, location, job_name)
    try:
        client.delete_job(name=name)
    except Exception as e:
        if "not found" not in str(e).lower() and "404" not in str(e):
            raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}
