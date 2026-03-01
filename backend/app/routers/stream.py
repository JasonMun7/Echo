"""
SSE endpoint: GET /api/run/{workflow_id}/{run_id}/stream
Streams real-time EchoPrism thought+action events from Firestore logs.
"""
import asyncio
import json
import logging

import firebase_admin.firestore
from fastapi import APIRouter, Depends, Query
from sse_starlette.sse import EventSourceResponse

from app.auth import get_current_uid, get_firebase_app

logger = logging.getLogger(__name__)
router = APIRouter(tags=["stream"])


@router.get("/run/{workflow_id}/{run_id}/stream")
async def stream_run_thoughts(
    workflow_id: str,
    run_id: str,
    uid: str = Depends(get_current_uid),
):
    """Server-Sent Events stream of EchoPrism thoughts for a live run."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)

    async def event_generator():
        seen_ids: set[str] = set()
        consecutive_empty = 0
        max_empty = 300  # stop after ~5 minutes of silence

        while True:
            try:
                run_ref = (
                    db.collection("workflows")
                    .document(workflow_id)
                    .collection("runs")
                    .document(run_id)
                )
                run_snap = await asyncio.to_thread(run_ref.get)
                run_data = run_snap.to_dict() or {}
                run_status = run_data.get("status", "")

                logs_ref = run_ref.collection("logs")
                docs = await asyncio.to_thread(
                    lambda: list(logs_ref.order_by("timestamp").stream())
                )

                new_events = []
                for doc in docs:
                    if doc.id not in seen_ids:
                        seen_ids.add(doc.id)
                        data = doc.to_dict() or {}
                        thought = data.get("thought") or data.get("message", "")
                        action = data.get("action", "")
                        step_index = data.get("step_index", 0)
                        level = data.get("level", "info")
                        if thought or action:
                            new_events.append({
                                "thought": thought,
                                "action": action,
                                "step_index": step_index,
                                "level": level,
                            })

                if new_events:
                    consecutive_empty = 0
                    for event in new_events:
                        yield {"data": json.dumps(event)}
                else:
                    consecutive_empty += 1

                # Stop streaming when run is terminal or too quiet
                if run_status in ("completed", "failed", "cancelled"):
                    yield {"data": json.dumps({"done": True, "status": run_status})}
                    break

                if consecutive_empty >= max_empty:
                    break

                await asyncio.sleep(1.0)

            except Exception as e:
                logger.error("SSE stream error: %s", e)
                await asyncio.sleep(2.0)

    return EventSourceResponse(event_generator())
