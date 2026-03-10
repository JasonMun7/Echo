"""
COCO4GUI trace exporter — convert run traces to COCO4GUI JSON.

Input: run_id, workflow_id, step data (screenshot URL, thought, action, x, y, quality)
Output: COCO4GUI JSON with images (screenshot refs), annotations (bbox, keypoints,
  thought, action, quality, error, corrected_thought)
Tag recovery actions as category: "recovery_action"
"""
import json
import logging
import os
import re
from typing import Any

from echo_prism.datasets.coco4gui_builder import COCO4GUIBuilder

logger = logging.getLogger(__name__)


def _parse_coords_from_action(action_str: str) -> tuple[float | None, float | None]:
    """Extract (x, y) from action string e.g. Click(250, 45) or point([0.45, 0.12])."""
    if not action_str:
        return None, None
    m = re.search(r"Click\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)", action_str, re.I)
    if m:
        x, y = float(m.group(1)), float(m.group(2))
        return round(x / 1000, 3), round(y / 1000, 3)
    m = re.search(r"point\s*\(\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]\s*\)", action_str, re.I)
    if m:
        return round(float(m.group(1)), 3), round(float(m.group(2)), 3)
    m = re.search(r"(?:RightClick|DoubleClick|Hover|SelectOption)\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)", action_str, re.I)
    if m:
        x, y = float(m.group(1)), float(m.group(2))
        return round(x / 1000, 3), round(y / 1000, 3)
    return None, None


def _is_recovery_action(action_str: str, thought: str) -> bool:
    """Heuristic: Escape Key Pulse or Blind-Click suggests recovery."""
    if not action_str:
        return False
    s = (action_str + " " + (thought or "")).lower()
    return (
        "escape" in s
        or "presskey(\"escape\")" in s
        or "blind" in s
        or "0.050, 0.050" in s
        or "0.950, 0.050" in s
    )


def export_run_to_coco(
    run_ref: Any,
    workflow_id: str,
    run_id: str,
    db: Any,
    bucket_name: str | None = None,
) -> dict:
    """Export a run's trace to COCO4GUI format. Returns the COCO4GUI dict."""
    bucket = bucket_name or os.environ.get("ECHO_GCS_BUCKET")
    gcs_base = f"gs://{bucket}" if bucket else ""

    logs_ref = run_ref.collection("logs")
    trace_logs = [
        d.to_dict()
        for d in logs_ref.stream()
        if d.to_dict().get("trace") is True
    ]
    trace_logs.sort(key=lambda x: x.get("step_index", 0))

    doc_id = f"{workflow_id}_{run_id}"
    ft_ref = db.collection("filtered_traces").document(doc_id)
    ft_doc = ft_ref.get()
    steps_by_index: dict[int, dict] = {}
    if ft_doc.exists:
        for step_doc in ft_ref.collection("steps").stream():
            d = step_doc.to_dict() or {}
            idx = d.get("step_index")
            if idx is not None:
                steps_by_index[idx] = d

    builder = COCO4GUIBuilder(description=f"EchoPrism trace {workflow_id}/{run_id}")

    for log in trace_logs:
        step_index = log.get("step_index", 0)
        thought = log.get("thought", "")
        action_str = log.get("action", "")
        screenshot_url = log.get("screenshot_url")
        step_data = steps_by_index.get(step_index, {})

        if not screenshot_url:
            screenshot_url = step_data.get("screenshot_url")

        quality = step_data.get("quality", "unknown")
        corrected_thought = step_data.get("corrected_thought", "")
        error = step_data.get("error", "")

        width, height = 1920, 1080
        file_name = f"step_{step_index}.png"
        if screenshot_url and "traces/" in screenshot_url:
            file_name = screenshot_url.split("/")[-1] or file_name

        img_id = builder.add_image(
            file_name=file_name,
            width=width,
            height=height,
            application="EchoPrism",
            platform="browser",
            sequence_id=run_id,
            sequence_position=step_index,
            sequence_description=f"Workflow {workflow_id}",
            gcs_url=screenshot_url or (f"{gcs_base}/traces/{workflow_id}/{run_id}/step_{step_index}.png" if gcs_base else None),
        )

        x_norm, y_norm = _parse_coords_from_action(action_str)
        cx = (x_norm or 0.5) * width
        cy = (y_norm or 0.5) * height
        bw, bh = max(4, int(width * 0.02)), max(4, int(height * 0.02))
        bbox = [max(0, cx - bw // 2), max(0, cy - bh // 2), bw, bh]
        keypoints = [cx, cy] if (x_norm is not None and y_norm is not None) else None

        category = "recovery_action" if _is_recovery_action(action_str, thought) else None

        attrs: dict[str, Any] = {
            "task_description": thought or action_str,
            "action_type": "click",
            "element_info": "",
            "thought": thought,
            "quality": quality,
        }
        if corrected_thought:
            attrs["corrected_thought"] = corrected_thought
        if error:
            attrs["error"] = error

        builder.add_annotation(
            image_id=img_id,
            bbox=bbox,
            keypoints=keypoints,
            action_type="click",
            task_description=thought or action_str,
            thought=thought,
            corrected_thought=corrected_thought or None,
            quality=quality,
            error=error or None,
            category=category,
            width=width,
            height=height,
        )

    return builder.to_dict()


async def export_and_upload_coco(
    run_ref: Any,
    workflow_id: str,
    run_id: str,
    db: Any,
    bucket_name: str | None = None,
) -> str:
    """Export trace to COCO4GUI and upload to GCS. Returns GCS path."""
    coco = export_run_to_coco(run_ref, workflow_id, run_id, db, bucket_name)
    blob_name = f"traces/{workflow_id}/{run_id}/trace_coco.json"
    bucket = bucket_name or os.environ.get("ECHO_GCS_BUCKET")
    if not bucket:
        raise ValueError("ECHO_GCS_BUCKET not set")

    try:
        from google.cloud import storage
        client = storage.Client()
        bucket_obj = client.bucket(bucket)
        blob = bucket_obj.blob(blob_name)
        blob.upload_from_string(
            json.dumps(coco, indent=2),
            content_type="application/json",
        )
        gcs_path = f"gs://{bucket}/{blob_name}"
        logger.info("Exported COCO trace to %s", gcs_path)
        return gcs_path
    except Exception as e:
        logger.exception("Failed to upload COCO trace: %s", e)
        raise RuntimeError(f"COCO trace upload failed: {e}") from e
