"""
EchoPrism Alpha WebSocket: /api/agent/run

Single canonical interface for the agent. All clients (desktop, Cloud Run Job, future) connect
here. Alpha orchestrates subagents; returns actions for clients to execute locally (NutJS/Playwright).

Auth: Firebase ID token (desktop) OR job_token + workflow_id + run_id (Cloud Run Job).
"""
import asyncio
import base64
import json
import logging
import os
import sys

import firebase_admin
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials
from google.cloud.firestore import DELETE_FIELD

from app.auth import get_firebase_app

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])


def _ensure_agent_path() -> None:
    agent_dir = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "..", "agent")
    )
    if agent_dir not in sys.path:
        sys.path.insert(0, agent_dir)


def _verify_token(token: str | None) -> str | None:
    if not token:
        return None
    try:
        get_firebase_app()
        decoded = firebase_auth.verify_id_token(token)
        return decoded.get("uid")
    except Exception:
        return None


async def _verify_job_token(
    job_token: str | None,
    workflow_id: str | None,
    run_id: str | None,
) -> tuple[str | None, str | None]:
    """
    Validate job_token against Firestore run doc. Returns (uid, None) on success or (None, error_msg).
    Clears job_connect_token after first successful validation.
    """
    if not job_token or not workflow_id or not run_id:
        return None, "job_token auth requires job_token, workflow_id, run_id"
    try:
        app = get_firebase_app()
        db = firebase_admin.firestore.client(app)
        run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
        doc = run_ref.get()
        if not doc.exists:
            return None, "Run not found"
        data = doc.to_dict() or {}
        stored_token = data.get("job_connect_token")
        if not stored_token or stored_token != job_token:
            return None, "Invalid or expired job_token"
        status = data.get("status", "")
        if status not in ("running", "pending"):
            return None, "Run is not active"
        uid = data.get("owner_uid", "")
        if not uid:
            return None, "Run has no owner_uid"
        run_ref.update({"job_connect_token": DELETE_FIELD})
        return uid, None
    except Exception as e:
        logger.exception("job_token validation failed: %s", e)
        return None, str(e)


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


@router.websocket("/run")
async def agent_run_ws(
    websocket: WebSocket,
    token: str | None = Query(default=None, description="Firebase ID token (desktop)"),
    job_token: str | None = Query(default=None, description="Job connect token (Cloud Run Job)"),
    workflow_id: str | None = Query(default=None, description="Workflow ID (required with job_token)"),
    run_id: str | None = Query(default=None, description="Run ID (required with job_token)"),
):
    """
    EchoPrism agent WebSocket. Clients send step + screenshot; backend returns action.
    Auth: token (Firebase) OR job_token+workflow_id+run_id (Job).
    Message types:
      Client -> Server: start, step, verify
      Server -> Client: thinking, action, done, error
    """
    uid: str | None = None
    if token:
        uid = _verify_token(token)
    elif job_token and workflow_id and run_id:
        uid, job_err = await _verify_job_token(job_token, workflow_id, run_id)
        if job_err:
            logger.warning("job_token auth failed: %s", job_err)
            uid = None
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
    history: list[dict] = []
    cached_prompt: str | None = None
    pending_thought: str = ""
    pending_action_str: str = ""

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
                steps = data.get("steps", [])
                if not workflow_id or not run_id or not steps:
                    await send({"type": "error", "message": "start requires workflow_id, run_id, steps"})
                    continue
                ok = await _validate_run_access(uid, workflow_id, run_id)
                if not ok:
                    await send({"type": "error", "message": "Run not found or access denied"})
                    continue
                history = []
                cached_prompt = None
                await send({"type": "ready"})

            elif msg_type == "step":
                step_index = data.get("step_index", 0)
                step = data.get("step", {})
                screenshot_b64 = data.get("screenshot_b64")
                history_summary = data.get("history_summary", "")
                last_error = data.get("last_error", "")

                if not step:
                    await send({"type": "error", "message": "step requires step"})
                    continue

                # Deterministic: no screenshot needed
                if is_deterministic(step):
                    action = (step.get("action") or "").lower().replace("_", "")
                    if action == "apicall" or step.get("action") == "api_call":
                        # api_call needs Firestore integration tokens — execute server-side
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
                        await send({
                            "type": "action",
                            "action": action_dict,
                            "thought": "",
                            "signal": "execute",
                        })
                    continue

                # Ambiguous: need screenshot
                if not screenshot_b64:
                    await send({"type": "error", "message": "Ambiguous step requires screenshot_b64"})
                    continue

                try:
                    screenshot_bytes = base64.b64decode(screenshot_b64)
                except Exception:
                    await send({"type": "error", "message": "Invalid screenshot_b64"})
                    continue

                total = len(steps) if steps else 1
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
                )

                if result == "finished":
                    await send({"type": "action", "thought": thought, "signal": "finished"})
                    await send({"type": "done", "success": True})
                    continue

                if result == "calluser":
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
                    history.append({
                        "thought": pending_thought,
                        "action": action_str,
                        "screenshot": compress_screenshot(after_bytes),
                    })
                    pending_thought = ""
                    pending_action_str = ""
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
