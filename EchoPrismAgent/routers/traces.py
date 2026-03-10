"""
Trace endpoints for EchoPrism Learning from Prior Experience.
Moved to agent service (uses echo_prism training modules).

POST /api/workflows/{workflow_id}/runs/{run_id}/filter
GET /api/traces
POST /api/traces/export
GET /api/traces/model-status
POST /api/traces/poll-model
"""
import asyncio
import logging
import os
import sys
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import firebase_admin.firestore
from google.cloud.firestore import SERVER_TIMESTAMP, FieldFilter

from app.auth import get_current_uid, get_firebase_app
from app.routers.workflows import _get_workflow

logger = logging.getLogger(__name__)

router = APIRouter(tags=["traces"])


def _ensure_agent_path() -> None:
    base = Path(__file__).resolve().parent.parent
    agent_dir = base / "agent" if (base / "agent").exists() else base / "backend" / "agent"
    if not agent_dir.exists():
        agent_dir = base.parent.parent / "backend" / "agent"
    agent_dir = agent_dir.resolve()
    if agent_dir.exists() and str(agent_dir) not in sys.path:
        sys.path.insert(0, str(agent_dir))


def _get_db():
    return firebase_admin.firestore.client(get_firebase_app())


@router.post("/workflows/{workflow_id}/runs/{run_id}/filter")
async def filter_run_trace(
    workflow_id: str,
    run_id: str,
    uid: str = Depends(get_current_uid),
):
    """Trigger Gemini-based scoring for a completed run's trace."""
    _get_workflow(uid, workflow_id)
    db = _get_db()
    run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
    run_doc = run_ref.get()
    if not run_doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")

    _ensure_agent_path()
    try:
        from echo_prism.training.trace_filter import score_trace
        scored = await score_trace(run_ref, workflow_id, run_id, db, uid)
        good = sum(1 for s in scored if s.get("quality") == "good")
        bad = sum(1 for s in scored if s.get("quality") == "bad")
        return {
            "ok": True,
            "step_count": len(scored),
            "good_count": good,
            "bad_count": bad,
            "doc_id": f"{workflow_id}_{run_id}",
        }
    except Exception as e:
        logger.exception("Trace filter failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traces")
async def list_traces(uid: str = Depends(get_current_uid)):
    """List all filtered trace documents for the authenticated user."""
    db = _get_db()
    try:
        docs = (
            db.collection("filtered_traces")
            .where(filter=FieldFilter("owner_uid", "==", uid))
            .stream()
        )
        items = []
        for d in docs:
            data = d.to_dict() or {}
            items.append({
                "id": d.id,
                "workflow_id": data.get("workflow_id"),
                "run_id": data.get("run_id"),
                "step_count": data.get("step_count", 0),
                "good_count": data.get("good_count", 0),
                "bad_count": data.get("bad_count", 0),
                "scored_at": data.get("scored_at"),
            })
        return {"traces": items}
    except Exception as e:
        logger.exception("Failed to list traces: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


class ReviewStepBody(BaseModel):
    human_quality: Literal["approved", "rejected"] | None = None
    human_corrected_thought: str | None = None


@router.delete("/traces/{trace_id}")
async def delete_trace(trace_id: str, uid: str = Depends(get_current_uid)):
    """Delete a filtered trace document."""
    db = _get_db()
    ft_ref = db.collection("filtered_traces").document(trace_id)
    ft_doc = ft_ref.get()
    if not ft_doc.exists or (ft_doc.to_dict() or {}).get("owner_uid") != uid:
        raise HTTPException(status_code=404, detail="Trace not found")
    try:
        for step_doc in ft_ref.collection("steps").stream():
            step_doc.reference.delete()
        ft_ref.delete()
        return {"ok": True, "deleted": trace_id}
    except Exception as e:
        logger.exception("Failed to delete trace: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traces/{trace_id}/coco")
async def get_trace_coco(trace_id: str, uid: str = Depends(get_current_uid)):
    """Fetch or generate COCO4GUI JSON for a trace."""
    db = _get_db()
    if "_" not in trace_id:
        raise HTTPException(status_code=400, detail="Invalid trace_id format. Use workflow_id_run_id")
    parts = trace_id.rsplit("_", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid trace_id format")
    workflow_id, run_id = parts[0], parts[1]
    _get_workflow(uid, workflow_id)
    run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
    run_doc = run_ref.get()
    if not run_doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")

    _ensure_agent_path()
    try:
        from echo_prism.training.trace_coco_export import export_run_to_coco
        coco = export_run_to_coco(run_ref, workflow_id, run_id, db)
        return coco
    except Exception as e:
        logger.exception("COCO export failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traces/{trace_id}/steps")
async def list_trace_steps(trace_id: str, uid: str = Depends(get_current_uid)):
    """List scored steps for a specific filtered trace."""
    db = _get_db()
    ft_ref = db.collection("filtered_traces").document(trace_id)
    ft_doc = ft_ref.get()
    if not ft_doc.exists or (ft_doc.to_dict() or {}).get("owner_uid") != uid:
        raise HTTPException(status_code=404, detail="Trace not found")

    steps = []
    for step_doc in ft_ref.collection("steps").stream():
        data = step_doc.to_dict() or {}
        steps.append({
            "id": step_doc.id,
            "step_index": data.get("step_index"),
            "thought": data.get("thought", ""),
            "action": data.get("action", ""),
            "quality": data.get("quality", "unknown"),
            "rule_reason": data.get("rule_reason", ""),
            "vlm_reason": data.get("vlm_reason", ""),
            "corrected_thought": data.get("corrected_thought", ""),
            "error": data.get("error", ""),
            "human_quality": data.get("human_quality"),
            "human_corrected_thought": data.get("human_corrected_thought"),
            "reviewed": data.get("reviewed", False),
        })
    steps.sort(key=lambda x: x.get("step_index") or 0)
    return {"steps": steps}


@router.patch("/traces/{trace_id}/steps/{step_id}")
async def review_trace_step(
    trace_id: str,
    step_id: str,
    body: ReviewStepBody,
    uid: str = Depends(get_current_uid),
):
    """Submit a human review decision for a scored trace step."""
    db = _get_db()
    ft_ref = db.collection("filtered_traces").document(trace_id)
    ft_doc = ft_ref.get()
    if not ft_doc.exists or (ft_doc.to_dict() or {}).get("owner_uid") != uid:
        raise HTTPException(status_code=404, detail="Trace not found")

    step_ref = ft_ref.collection("steps").document(step_id)
    step_doc = step_ref.get()
    if not step_doc.exists:
        raise HTTPException(status_code=404, detail="Step not found")

    update_payload: dict = {"reviewed": True}
    if body.human_quality is not None:
        update_payload["human_quality"] = body.human_quality
    if body.human_corrected_thought is not None:
        update_payload["human_corrected_thought"] = body.human_corrected_thought.strip() or None

    step_ref.update(update_payload)
    return {"ok": True, "step_id": step_id, **update_payload}


@router.post("/traces/export")
async def export_traces(uid: str = Depends(get_current_uid)):
    """Export filtered traces as Vertex AI SFT dataset and submit tuning job."""
    db = _get_db()
    _ensure_agent_path()

    bucket = os.environ.get("ECHO_GCS_BUCKET")
    if not bucket:
        raise HTTPException(status_code=500, detail="ECHO_GCS_BUCKET not configured")

    gcs_blob_path = "training/global/dataset.jsonl"
    gcs_uri = f"gs://{bucket}/{gcs_blob_path}"

    try:
        from echo_prism.training.vertex_export import create_tuning_job, export_training_data

        example_count = await export_training_data(
            db=db,
            output_gcs_path=gcs_blob_path,
            bucket_name=bucket,
        )

        if example_count == 0:
            raise HTTPException(
                status_code=400,
                detail="No training examples available. Run more workflows to generate trace data.",
            )

        job_name = await create_tuning_job(
            gcs_dataset_uri=gcs_uri,
            db=db,
            example_count=example_count,
        )

        return {
            "ok": True,
            "job_name": job_name,
            "gcs_path": gcs_uri,
            "example_count": example_count,
            "job_status": "training",
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("Export failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traces/model-status")
async def get_model_status(uid: str = Depends(get_current_uid)):
    """Return current fine-tuning job state from global_model/current."""
    db = _get_db()
    doc = db.collection("global_model").document("current").get()
    if not doc.exists:
        return {"has_model": False, "job_status": None, "tuned_model_id": None}

    data = doc.to_dict() or {}
    return {
        "has_model": data.get("job_status") == "ready",
        "job_status": data.get("job_status"),
        "job_name": data.get("job_name"),
        "tuned_model_id": data.get("tuned_model_id"),
        "base_model": data.get("base_model"),
        "example_count": data.get("example_count", 0),
        "submitted_at": data.get("submitted_at"),
        "completed_at": data.get("completed_at"),
    }


@router.post("/traces/poll-model")
async def poll_model_status(uid: str = Depends(get_current_uid)):
    """Check Vertex AI tuning job status and update global_model/current."""
    db = _get_db()
    doc_ref = db.collection("global_model").document("current")
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="No tuning job found. Export traces first.")

    data = doc.to_dict() or {}
    job_name = data.get("job_name")
    if not job_name:
        raise HTTPException(status_code=404, detail="No job_name stored. Export traces first.")

    if data.get("job_status") == "ready":
        return {
            "ok": True,
            "job_status": "ready",
            "tuned_model_id": data.get("tuned_model_id"),
            "message": "Global model already ready.",
        }

    _ensure_agent_path()
    try:
        from echo_prism.training.vertex_export import get_tuning_job_status

        job_info = await asyncio.to_thread(
            get_tuning_job_status,
            job_name,
            data.get("project"),
            data.get("location", "us-central1"),
        )

        state = job_info.get("state", "")
        tuned_model_endpoint = job_info.get("tuned_model_endpoint_name")

        if "SUCCEEDED" in state and tuned_model_endpoint:
            doc_ref.update({
                "job_status": "ready",
                "tuned_model_id": tuned_model_endpoint,
                "completed_at": SERVER_TIMESTAMP,
            })
            logger.info("Global tuning job complete: model=%s", tuned_model_endpoint)
            return {
                "ok": True,
                "job_status": "ready",
                "tuned_model_id": tuned_model_endpoint,
                "message": "Fine-tuning complete.",
            }
        elif "FAILED" in state or "CANCELLED" in state:
            doc_ref.update({"job_status": "failed", "completed_at": SERVER_TIMESTAMP})
            return {
                "ok": False,
                "job_status": "failed",
                "tuned_model_id": None,
                "message": f"Tuning job ended with state: {state}",
            }
        else:
            return {
                "ok": True,
                "job_status": "training",
                "tuned_model_id": None,
                "message": f"Job still in progress (state: {state}).",
            }
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("Poll model failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
