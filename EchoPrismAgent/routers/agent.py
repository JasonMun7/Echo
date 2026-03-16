"""
EchoPrism Alpha WebSocket: /api/agent/run

Single canonical interface for the agent. Desktop clients connect here for AI inference.
Alpha orchestrates subagents; returns actions for clients to execute locally (NutJS/Playwright).

Auth: Firebase ID token (token query param).
"""
import asyncio
import base64
import json
import logging
import os
import sys
from pathlib import Path

import firebase_admin
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from firebase_admin import firestore as fs_module

from app.auth import get_firebase_app

_security = HTTPBearer(auto_error=False)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])


def _ensure_agent_path() -> None:
    """Ensure agent (echo_prism, direct_executor) is on sys.path."""
    base = Path(__file__).resolve().parent.parent
    agent_dir = base / "agent" if (base / "agent").exists() else base / "backend" / "agent"
    if not agent_dir.exists():
        agent_dir = base.parent.parent / "backend" / "agent"
    agent_dir = agent_dir.resolve()
    if agent_dir.exists() and str(agent_dir) not in sys.path:
        sys.path.insert(0, str(agent_dir))


def _verify_token(token: str | None) -> str | None:
    if not token:
        return None
    try:
        get_firebase_app()
        decoded = firebase_auth.verify_id_token(token)
        return decoded.get("uid")
    except Exception:
        return None


async def _validate_run_access(uid: str, workflow_id: str, run_id: str) -> bool:
    """Check that the run exists and belongs to the user."""
    try:
        app = get_firebase_app()
        db = firebase_admin.firestore.client(app)
        run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
        doc = run_ref.get()
        if not doc.exists:
            return False
        data = doc.to_dict() or {}
        return data.get("owner_uid") == uid
    except Exception:
        return False


def _write_run_log(db, workflow_id: str, run_id: str, thought: str, action: str, step_index: int, level: str = "info") -> None:
    """Write a thought+action log entry to Firestore (called in a thread)."""
    try:
        logs_col = (
            db.collection("workflows")
            .document(workflow_id)
            .collection("runs")
            .document(run_id)
            .collection("logs")
        )
        logs_col.add({
            "thought": thought,
            "action": action,
            "step_index": step_index,
            "message": f"Step {step_index + 1}: {action}" if action else thought,
            "level": level,
            "timestamp": fs_module.SERVER_TIMESTAMP,
        })
    except Exception as e:
        logger.warning("Failed to write run log: %s", e)


def _update_log_screenshot(
    db, workflow_id: str, run_id: str, step_index: int, screenshot_url: str
) -> None:
    """Update the most recent log entry for this step_index with screenshot_url (called in a thread)."""
    try:
        logs_ref = (
            db.collection("workflows")
            .document(workflow_id)
            .collection("runs")
            .document(run_id)
            .collection("logs")
        )
        # Get recent logs and find the one matching step_index (avoids composite index)
        docs = list(logs_ref.order_by("timestamp", direction="DESCENDING").limit(100).stream())
        for doc in docs:
            if (doc.to_dict() or {}).get("step_index") == step_index:
                doc.reference.update({"screenshot_url": screenshot_url})
                return
    except Exception as e:
        logger.warning("Failed to update log screenshot: %s", e)


def _upload_and_update_log_screenshot(
    db, workflow_id: str, run_id: str, step_index: int, after_bytes: bytes
) -> None:
    """Upload step screenshot to GCS and set screenshot_url on the matching log entry (called in a thread)."""
    try:
        from screenshot_stream import upload_step_screenshot
        url = upload_step_screenshot(workflow_id, run_id, step_index, after_bytes)
        if url:
            _update_log_screenshot(db, workflow_id, run_id, step_index, url)
    except Exception as e:
        logger.warning("Failed to upload/update step screenshot: %s", e)


@router.get(
    "/workflows/{workflow_id}/runs/{run_id}/steps/{step_index}/screenshot",
    responses={200: {"content": {"image/png": {}}}, 401: {}, 404: {}},
)
async def get_step_screenshot(
    workflow_id: str,
    run_id: str,
    step_index: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
):
    """
    Return the step screenshot image bytes (PNG). Use this in production so images
    load reliably (avoids expired signed URLs / CORS). Requires Authorization: Bearer <Firebase ID token>.
    """
    token = credentials.credentials if credentials else None
    uid = _verify_token(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization")
    ok = await _validate_run_access(uid, workflow_id, run_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Run not found")
    base = Path(__file__).resolve().parent.parent
    agent_dir = base / "agent" if (base / "agent").exists() else base / "backend" / "agent"
    if not agent_dir.exists():
        agent_dir = base.parent.parent / "backend" / "agent"
    agent_dir = agent_dir.resolve()
    if agent_dir.exists() and str(agent_dir) not in sys.path:
        sys.path.insert(0, str(agent_dir))
    try:
        from screenshot_stream import get_step_screenshot_bytes
    except ImportError:
        raise HTTPException(status_code=503, detail="Screenshot storage not available")
    data = get_step_screenshot_bytes(workflow_id, run_id, step_index)
    if not data:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return Response(content=data, media_type="image/png")


@router.websocket("/run")
async def agent_run_ws(
    websocket: WebSocket,
    token: str | None = Query(default=None, description="Firebase ID token"),
):
    """
    EchoPrism agent WebSocket. Clients send step + screenshot; returns action.
    Auth: Firebase ID token (token query param).
    Message types:
      Client -> Server: start, step, verify
      Server -> Client: thinking, action, done, error
    """
    uid = _verify_token(token)
    if not uid:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    _ensure_agent_path()
    from direct_executor import is_deterministic, step_to_action
    from echo_prism.alpha.agent import (
        run_ambiguous_step_inference,
        verify_state_transition,
    )
    from echo_prism.subagents.runner_agent import _execute_api_call as execute_api_call

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        await websocket.send_json({"type": "error", "message": "GEMINI_API_KEY not configured"})
        await websocket.close()
        return

    app_fb = get_firebase_app()
    db = firebase_admin.firestore.client(app_fb)

    workflow_id: str | None = None
    run_id: str | None = None
    steps: list[dict] = []
    workflow_type: str = "desktop"
    goal_only: bool = False
    goal: str = ""
    history: list[dict] = []
    cached_prompt: str | None = None
    pending_thought: str = ""
    pending_action_str: str = ""
    pending_step_index: int = -1

    async def send(msg: dict) -> None:
        try:
            await websocket.send_json(msg)
        except Exception as e:
            logger.warning("agent WS send failed: %s", e)

    try:
        while True:
            raw = await websocket.receive()
            if raw.get("type") == "websocket.disconnect":
                break
            if raw.get("type") != "websocket.receive" or not raw.get("text"):
                continue

            try:
                data = json.loads(raw["text"])
            except json.JSONDecodeError:
                await send({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = data.get("type", "")

            if msg_type == "start":
                workflow_id = data.get("workflow_id", "")
                run_id = data.get("run_id", "")
                workflow_type = data.get("workflow_type", "desktop")
                steps = data.get("steps") if data.get("steps") is not None else []
                goal = (data.get("goal") or "").strip()
                goal_only = bool(goal and (not steps or len(steps) == 0))
                if not goal_only:
                    goal = ""
                if not workflow_id or not run_id:
                    await send({"type": "error", "message": "start requires workflow_id and run_id"})
                    continue
                if not goal_only and not steps:
                    await send({"type": "error", "message": "start requires steps or goal for goal-only run"})
                    continue
                ok = await _validate_run_access(uid, workflow_id, run_id)
                if not ok:
                    await send({"type": "error", "message": "Run not found or access denied"})
                    continue
                if goal_only:
                    logger.info(
                        "agent WS start goal_only: workflow_id=%s run_id=%s goal=%s",
                        workflow_id,
                        run_id,
                        (goal or "")[:80],
                    )
                history = []
                cached_prompt = None
                await send({"type": "ready"})

            elif msg_type == "step":
                step_index = data.get("step_index", 0)
                step = data.get("step") or {}
                screenshot_b64 = data.get("screenshot_b64")
                history_summary = data.get("history_summary", "")
                last_error = data.get("last_error", "")

                if goal_only and (step_index == 0 or step_index == 1):
                    logger.info(
                        "agent WS step (goal_only): step_index=%s has_screenshot=%s last_error=%s",
                        step_index,
                        bool(screenshot_b64 and len(screenshot_b64) > 100),
                        last_error[:50] if last_error else "",
                    )

                if goal_only and not step and goal:
                    step = {"context": goal, "action": "observe", "params": {}, "expected_outcome": ""}
                if not step:
                    await send({"type": "error", "message": "step requires step (or goal for goal-only run)"})
                    continue

                if not goal_only and is_deterministic(step):
                    action = (step.get("action") or "").lower().replace("_", "")
                    logger.info(
                        "WS step %d: deterministic %r, params=%s",
                        step_index,
                        step.get("action"),
                        step.get("params", {}),
                    )
                    if action == "apicall" or step.get("action") == "api_call":
                        ok, err = await execute_api_call(step, uid, db)
                        if ok:
                            await send({
                                "type": "action",
                                "thought": "",
                                "signal": "step_done",
                            })
                        else:
                            await send({"type": "error", "message": err or "api_call failed"})
                    else:
                        action_dict = step_to_action(step)
                        logger.info(
                            "WS step %d: execute action=%s",
                            step_index,
                            action_dict,
                        )
                        await send({
                            "type": "action",
                            "action": action_dict,
                            "thought": "",
                            "signal": "execute",
                        })
                    continue

                if not screenshot_b64:
                    await send({"type": "error", "message": "Ambiguous step requires screenshot_b64"})
                    continue

                try:
                    screenshot_bytes = base64.b64decode(screenshot_b64)
                except Exception:
                    await send({"type": "error", "message": "Invalid screenshot_b64"})
                    continue

                total = 1 if goal_only else (len(steps) if steps else 1)
                result, thought, action_str, parsed_action, err = await run_ambiguous_step_inference(
                    screenshot_bytes=screenshot_bytes,
                    step_data=step,
                    step_index=step_index + 1,
                    total=total,
                    history=history,
                    workflow_type=workflow_type,
                    api_key=api_key,
                    owner_uid=uid,
                    db=db,
                    cached_prompt=cached_prompt,
                    last_error_from_client=last_error,
                    goal_only=goal_only,
                    goal=goal if goal_only else None,
                )

                if result == "finished":
                    if workflow_id and run_id and thought:
                        asyncio.create_task(asyncio.to_thread(
                            _write_run_log, db, workflow_id, run_id, thought, "Finished", step_index
                        ))
                    await send({"type": "action", "thought": thought, "signal": "finished"})
                    await send({"type": "done", "success": True})
                    continue

                if result == "calluser":
                    if workflow_id and run_id:
                        reason = err or "Agent needs user intervention"
                        asyncio.create_task(asyncio.to_thread(
                            _write_run_log, db, workflow_id, run_id, thought, f"CallUser: {reason}", step_index, "warn"
                        ))
                    await send({
                        "type": "action",
                        "thought": thought,
                        "signal": "calluser",
                        "reason": err or "Agent needs user intervention",
                    })
                    continue

                if result is True and parsed_action:
                    pending_thought = thought
                    pending_action_str = action_str
                    pending_step_index = step_index
                    if workflow_id and run_id:
                        asyncio.create_task(asyncio.to_thread(
                            _write_run_log, db, workflow_id, run_id, thought, action_str, step_index
                        ))
                    # Send thinking first so desktop Run HUD and other clients can show the full thought
                    if thought:
                        await send({"type": "thinking", "thought": thought})
                    await send({
                        "type": "action",
                        "action": parsed_action,
                        "thought": thought,
                        "signal": "execute",
                        "action_str": action_str,
                    })
                else:
                    await send({
                        "type": "error",
                        "message": err or "Inference failed",
                    })

            elif msg_type == "verify":
                before_b64 = data.get("before_b64")
                after_b64 = data.get("after_b64")
                action_str = data.get("action_str", "")
                expected_outcome = data.get("expected_outcome", "")

                if not before_b64 or not after_b64:
                    await send({"type": "error", "message": "verify requires before_b64 and after_b64"})
                    continue

                try:
                    before_bytes = base64.b64decode(before_b64)
                    after_bytes = base64.b64decode(after_b64)
                except Exception:
                    await send({"type": "error", "message": "Invalid base64 in verify"})
                    continue

                description, succeeded = await verify_state_transition(
                    before_bytes=before_bytes,
                    after_bytes=after_bytes,
                    action_str=action_str,
                    expected_outcome=expected_outcome,
                    api_key=api_key,
                )

                if succeeded:
                    from echo_prism.alpha.image_utils import compress_screenshot
                    step_index_for_screenshot = pending_step_index
                    history.append({
                        "thought": pending_thought,
                        "action": action_str,
                        "screenshot": compress_screenshot(after_bytes),
                    })
                    pending_thought = ""
                    pending_action_str = ""
                    pending_step_index = -1
                    if workflow_id and run_id and step_index_for_screenshot >= 0:
                        asyncio.create_task(asyncio.to_thread(
                            _upload_and_update_log_screenshot,
                            db, workflow_id, run_id, step_index_for_screenshot, after_bytes,
                        ))
                    await send({"type": "verify_result", "succeeded": True, "description": description})
                else:
                    await send({"type": "verify_result", "succeeded": False, "description": description})

            else:
                await send({"type": "error", "message": f"Unknown message type: {msg_type}"})

    except WebSocketDisconnect:
        logger.debug("Agent WebSocket disconnected")
    except Exception as e:
        logger.exception("Agent WebSocket error: %s", e)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
