"""
EchoPrism workflow WebSocket: /api/agent/run

Single canonical interface for the agent. Desktop clients connect here for AI inference.
Returns actions for clients to execute locally (NutJS/Playwright).

Auth: Firebase ID token (token query param).
"""

import asyncio
import base64
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any

import firebase_admin
from app.auth import get_firebase_app
from echo_prism_agent.run_logging import run_log_prefix
from echo_prism_agent.ws_errors import (
    CONFIG,
    INFERENCE,
    INVALID_INPUT,
    PENDING_INTERRUPT,
    RESUME,
    RUN_ACCESS,
    UNKNOWN,
    VERIFY,
    classify_api_call_error,
    ws_error,
)
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from firebase_admin import firestore as fs_module

_security = HTTPBearer(auto_error=False)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])


def _interrupt_payload(intr: Any) -> Any:
    """Extract JSON-serializable value from LangGraph ``__interrupt__`` list."""
    lst = intr if isinstance(intr, (list, tuple)) else [intr]
    if not lst:
        return None
    first = lst[0]
    return getattr(first, "value", first)


def _ensure_agent_path() -> None:
    """Ensure agent service root is on sys.path so `echo_prism_agent` imports resolve."""
    root = Path(__file__).resolve().parent.parent
    if root.exists() and str(root) not in sys.path:
        sys.path.insert(0, str(root))


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


def _write_run_log(
    db,
    workflow_id: str,
    run_id: str,
    thought: str,
    action: str,
    step_index: int,
    level: str = "info",
) -> None:
    """Write a thought+action log entry to Firestore (called in a thread)."""
    try:
        logs_col = (
            db.collection("workflows").document(workflow_id).collection("runs").document(run_id).collection("logs")
        )
        logs_col.add(
            {
                "thought": thought,
                "action": action,
                "step_index": step_index,
                "message": f"Step {step_index + 1}: {action}" if action else thought,
                "level": level,
                "timestamp": fs_module.SERVER_TIMESTAMP,
            }
        )
    except Exception as e:
        logger.warning("Failed to write run log: %s", e)


def _update_log_screenshot(db, workflow_id: str, run_id: str, step_index: int, screenshot_url: str) -> None:
    """Update the most recent log entry for this step_index with screenshot_url (called in a thread)."""
    try:
        logs_ref = (
            db.collection("workflows").document(workflow_id).collection("runs").document(run_id).collection("logs")
        )
        # Get recent logs and find the one matching step_index (avoids composite index)
        docs = list(logs_ref.order_by("timestamp", direction="DESCENDING").limit(100).stream())
        for doc in docs:
            if (doc.to_dict() or {}).get("step_index") == step_index:
                doc.reference.update({"screenshot_url": screenshot_url})
                return
    except Exception as e:
        logger.warning("Failed to update log screenshot: %s", e)


def _upload_and_update_log_screenshot(db, workflow_id: str, run_id: str, step_index: int, after_bytes: bytes) -> None:
    """Upload step screenshot to GCS and set screenshot_url on the matching log entry (called in a thread)."""
    try:
        from echo_prism_agent.execution.operator import upload_step_screenshot

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
    root = Path(__file__).resolve().parent.parent
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    try:
        from echo_prism_agent.execution.operator import get_step_screenshot_bytes
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
      Client -> Server: start, step, verify, resume (after interrupt), cancel_interrupt
      Server -> Client: thinking_delta, thinking, action, done, error, verify_result
      action.signal interrupt: LangGraph HITL pause (e.g. integration_auth) — client opens Composio connect then sends resume.
    """
    uid = _verify_token(token)
    if not uid:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    _ensure_agent_path()
    from echo_prism_agent.agent import (
        run_ambiguous_step_inference,
        verify_state_transition,
    )
    from echo_prism_agent.execution.operator import (
        is_deterministic,
        step_to_action,
    )

    if not (os.environ.get("OPENROUTER_API_KEY") or "").strip():
        await websocket.send_json(
            ws_error(
                "OPENROUTER_API_KEY is required for inference (Gemini orchestration removed)",
                CONFIG,
            )
        )
        await websocket.close()
        return

    api_key = os.environ.get("GEMINI_API_KEY", "")

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
    pending_step_index: int = -1
    pending_api_call_resume: dict[str, Any] | None = None

    async def send(msg: dict) -> None:
        try:
            await websocket.send_json(msg)
        except Exception as e:
            logger.warning("agent WS send failed: %s", e)

    background_tasks: set[asyncio.Task[Any]] = set()

    def _schedule_to_thread(func, *args) -> None:
        task = asyncio.create_task(asyncio.to_thread(func, *args))
        background_tasks.add(task)
        task.add_done_callback(lambda t: background_tasks.discard(t))

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
                await send(ws_error("Invalid JSON", INVALID_INPUT))
                continue

            msg_type = data.get("type", "")

            if pending_api_call_resume and msg_type in (
                "start",
                "step",
                "verify",
            ):
                await send(
                    ws_error(
                        "Pending interrupt: send resume or cancel_interrupt first",
                        PENDING_INTERRUPT,
                    )
                )
                continue

            if msg_type == "resume":
                if not pending_api_call_resume:
                    await send(ws_error("No interrupt to resume", RESUME))
                    continue
                from echo_prism_agent.hitl.api_call_gate import get_api_call_gate_graph
                from langgraph.types import Command

                cfg = pending_api_call_resume["config"]
                graph = get_api_call_gate_graph()
                resume_val = data.get("resume", True)
                result = await graph.ainvoke(Command(resume=resume_val), config=cfg)
                step_ix = pending_api_call_resume.get("step_index", -1)
                pending_api_call_resume = None
                intr = result.get("__interrupt__")
                if intr:
                    payload = _interrupt_payload(intr)
                    pending_api_call_resume = {"config": cfg, "step_index": step_ix}
                    await send(
                        {
                            "type": "action",
                            "signal": "interrupt",
                            "thought": "",
                            "payload": payload,
                            "step_index": step_ix,
                        }
                    )
                    continue
                if result.get("ok"):
                    await send(
                        {
                            "type": "action",
                            "thought": "",
                            "signal": "step_done",
                        }
                    )
                else:
                    err_msg = result.get("error") or "api_call failed"
                    await send(ws_error(err_msg, classify_api_call_error(err_msg)))
                continue

            if msg_type == "cancel_interrupt":
                if pending_api_call_resume:
                    pending_api_call_resume = None
                    await send({"type": "ready", "cancelled_interrupt": True})
                else:
                    await send(ws_error("No pending interrupt", RESUME))
                continue

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
                    await send(ws_error("start requires workflow_id and run_id", INVALID_INPUT))
                    continue
                if not goal_only and not steps:
                    await send(
                        ws_error(
                            "start requires steps or goal for goal-only run",
                            INVALID_INPUT,
                        )
                    )
                    continue
                ok = await _validate_run_access(uid, workflow_id, run_id)
                if not ok:
                    await send(ws_error("Run not found or access denied", RUN_ACCESS))
                    continue
                if goal_only:
                    logger.info(
                        "%s agent WS start goal_only goal=%s",
                        run_log_prefix(workflow_id, run_id, uid=uid),
                        (goal or "")[:80],
                    )
                history = []
                cached_prompt = None
                await send({"type": "ready"})

            elif msg_type == "step":
                step_index = data.get("step_index", 0)
                step = data.get("step") or {}
                screenshot_b64 = data.get("screenshot_b64")
                last_error = data.get("last_error", "")
                typing_override = (data.get("typing_override") or "").strip()

                if goal_only and (step_index == 0 or step_index == 1):
                    logger.info(
                        "agent WS step (goal_only): step_index=%s has_screenshot=%s last_error=%s",
                        step_index,
                        bool(screenshot_b64 and len(screenshot_b64) > 100),
                        last_error[:50] if last_error else "",
                    )

                if goal_only and not step and goal:
                    step = {
                        "context": goal,
                        "action": "observe",
                        "params": {},
                        "expected_outcome": "",
                    }
                if not step:
                    await send(
                        ws_error(
                            "step requires step (or goal for goal-only run)",
                            INVALID_INPUT,
                        )
                    )
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
                        from echo_prism_agent.hitl.api_call_gate import get_api_call_gate_graph

                        # Stable thread so HITL resumes match this step; random id caused each retry to restart approval.
                        tid = f"{workflow_id}-{run_id}-s{step_index}"
                        gate_cfg = {
                            "configurable": {
                                "thread_id": tid,
                                "uid": uid,
                                "db": db,
                                "workflow_id": workflow_id,
                                "run_id": run_id,
                            }
                        }
                        graph = get_api_call_gate_graph()
                        result = await graph.ainvoke({"step": step}, config=gate_cfg)
                        intr = result.get("__interrupt__")
                        if intr:
                            payload = _interrupt_payload(intr)
                            pending_api_call_resume = {
                                "config": gate_cfg,
                                "step_index": step_index,
                            }
                            await send(
                                {
                                    "type": "action",
                                    "signal": "interrupt",
                                    "thought": "",
                                    "payload": payload,
                                    "step_index": step_index,
                                }
                            )
                            continue
                        if result.get("ok"):
                            await send(
                                {
                                    "type": "action",
                                    "thought": "",
                                    "signal": "step_done",
                                }
                            )
                        else:
                            err_msg = result.get("error") or "api_call failed"
                            await send(ws_error(err_msg, classify_api_call_error(err_msg)))
                    else:
                        action_dict = step_to_action(step)
                        logger.info(
                            "WS step %d: execute action=%s",
                            step_index,
                            action_dict,
                        )
                        await send(
                            {
                                "type": "action",
                                "action": action_dict,
                                "thought": "",
                                "signal": "execute",
                            }
                        )
                    continue

                if not screenshot_b64:
                    await send(ws_error("Ambiguous step requires screenshot_b64", INVALID_INPUT))
                    continue

                try:
                    screenshot_bytes = base64.b64decode(screenshot_b64)
                except Exception:
                    await send(ws_error("Invalid screenshot_b64", INVALID_INPUT))
                    continue

                capture_w = data.get("capture_width")
                capture_h = data.get("capture_height")
                if capture_w is not None and capture_h is not None:
                    try:
                        cw, ch = int(capture_w), int(capture_h)
                        if cw > 0 and ch > 0:
                            logger.debug(
                                "WS step %d: client capture dimensions %dx%d",
                                step_index,
                                cw,
                                ch,
                            )
                    except (TypeError, ValueError):
                        logger.debug(
                            "WS step %d: ignoring invalid capture dimensions capture_width=%r capture_height=%r",
                            step_index,
                            capture_w,
                            capture_h,
                        )

                async def send_thinking_delta(piece: str) -> None:
                    if piece:
                        await send({"type": "thinking_delta", "delta": piece})

                total = 1 if goal_only else (len(steps) if steps else 1)
                (
                    result,
                    thought,
                    action_str,
                    parsed_action,
                    err,
                ) = await run_ambiguous_step_inference(
                    screenshot_bytes=screenshot_bytes,
                    step_data=step,
                    step_index=step_index + 1,
                    total=total,
                    history=history,
                    workflow_type=workflow_type,
                    api_key=api_key,
                    owner_uid=uid,
                    db=db,
                    workflow_id=workflow_id,
                    run_id=run_id,
                    cached_prompt=cached_prompt,
                    last_error_from_client=last_error,
                    goal_only=goal_only,
                    goal=goal if goal_only else None,
                    thinking_delta_cb=send_thinking_delta,
                    typing_override=typing_override,
                )

                if result == "finished":
                    if workflow_id and run_id and thought:
                        _schedule_to_thread(
                            _write_run_log,
                            db,
                            workflow_id,
                            run_id,
                            thought,
                            "Finished",
                            step_index,
                        )
                    await send({"type": "action", "thought": thought, "signal": "finished"})
                    await send({"type": "done", "success": True})
                    continue

                if result == "calluser":
                    if workflow_id and run_id:
                        reason = err or "Agent needs user intervention"
                        _schedule_to_thread(
                            _write_run_log,
                            db,
                            workflow_id,
                            run_id,
                            thought,
                            f"CallUser: {reason}",
                            step_index,
                            "warn",
                        )
                    await send(
                        {
                            "type": "action",
                            "thought": thought,
                            "signal": "calluser",
                            "reason": err or "Agent needs user intervention",
                        }
                    )
                    continue

                if result is True and parsed_action:
                    pending_thought = thought
                    pending_step_index = step_index
                    if workflow_id and run_id:
                        _schedule_to_thread(
                            _write_run_log,
                            db,
                            workflow_id,
                            run_id,
                            thought,
                            action_str,
                            step_index,
                        )
                    # Send thinking first so desktop Run HUD and other clients can show the full thought
                    if thought:
                        await send({"type": "thinking", "thought": thought})
                    await send(
                        {
                            "type": "action",
                            "action": parsed_action,
                            "thought": thought,
                            "signal": "execute",
                            "action_str": action_str,
                        }
                    )
                else:
                    await send(ws_error(err or "Inference failed", INFERENCE))

            elif msg_type == "verify":
                before_b64 = data.get("before_b64")
                after_b64 = data.get("after_b64")
                action_str = data.get("action_str", "")
                expected_outcome = data.get("expected_outcome", "")

                if not before_b64 or not after_b64:
                    await send(
                        ws_error(
                            "verify requires before_b64 and after_b64",
                            INVALID_INPUT,
                        )
                    )
                    continue

                try:
                    before_bytes = base64.b64decode(before_b64)
                    after_bytes = base64.b64decode(after_b64)
                except Exception:
                    await send(ws_error("Invalid base64 in verify", INVALID_INPUT))
                    continue

                description, succeeded = await verify_state_transition(
                    before_bytes=before_bytes,
                    after_bytes=after_bytes,
                    action_str=action_str,
                    expected_outcome=expected_outcome,
                    api_key=api_key,
                )

                if succeeded:
                    from echo_prism_agent.ui_tars.screenshot_pipeline import compress_screenshot

                    step_index_for_screenshot = pending_step_index
                    history.append(
                        {
                            "thought": pending_thought,
                            "action": action_str,
                            "screenshot": compress_screenshot(after_bytes),
                        }
                    )
                    pending_thought = ""
                    pending_step_index = -1
                    if workflow_id and run_id and step_index_for_screenshot >= 0:
                        _schedule_to_thread(
                            _upload_and_update_log_screenshot,
                            db,
                            workflow_id,
                            run_id,
                            step_index_for_screenshot,
                            after_bytes,
                        )
                    await send({"type": "verify_result", "succeeded": True, "description": description})
                else:
                    await send(
                        {
                            "type": "verify_result",
                            "succeeded": False,
                            "description": description,
                            "code": VERIFY,
                        }
                    )

            else:
                await send(ws_error(f"Unknown message type: {msg_type}", UNKNOWN))

    except WebSocketDisconnect:
        logger.debug("Agent WebSocket disconnected")
    except Exception as e:
        logger.exception("Agent WebSocket error: %s", e)
        try:
            await websocket.send_json(ws_error(str(e), UNKNOWN))
        except Exception:
            pass
    finally:
        if background_tasks:
            await asyncio.gather(*background_tasks, return_exceptions=True)
        try:
            await websocket.close()
        except Exception:
            pass
