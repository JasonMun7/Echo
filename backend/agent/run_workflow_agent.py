#!/usr/bin/env python3
"""
Echo Workflow Executor — Cloud Run Job (browser).

Runs via WebSocket agent API: connects to backend, sends screenshots, receives actions.
Uses Playwright for capture/execute. No in-process agent.
Env: WORKFLOW_ID, RUN_ID, OWNER_UID, ECHO_API_URL (or BACKEND_URL), GEMINI_API_KEY
"""
import asyncio
import base64
import json
import logging
import os
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s", stream=sys.stderr)
logger = logging.getLogger(__name__)

# Load .env from agent dir or parent (backend) for local dev
try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore import SERVER_TIMESTAMP

from direct_executor import is_deterministic
from echo_prism.alpha.image_utils import compress_screenshot
from echo_prism.subagents.runner.operator import PlaywrightOperator

# Total workflow execution timeout: 5 minutes
WORKFLOW_TIMEOUT_SECS = 300


async def log_message(run_ref, message: str, level: str = "info", metadata: dict | None = None):
    """Append a log entry to runs/{run_id}/logs (non-blocking via asyncio.to_thread)."""
    entry: dict = {
        "message": message,
        "timestamp": SERVER_TIMESTAMP,
        "level": level,
    }
    if metadata:
        entry.update(metadata)
    await asyncio.to_thread(run_ref.collection("logs").add, entry)


def _trigger_trace_filter(run_ref, workflow_id: str, run_id: str, db, owner_uid: str) -> None:
    """Spawn a background daemon thread to score the completed run's trace and export COCO."""
    import threading

    def _filter_and_export():
        try:
            import asyncio as _asyncio
            from echo_prism.training.trace_filter import score_trace
            _asyncio.run(score_trace(run_ref, workflow_id, run_id, db, owner_uid))
            try:
                from echo_prism.training.trace_coco_export import export_and_upload_coco
                _asyncio.run(export_and_upload_coco(run_ref, workflow_id, run_id, db))
            except Exception as coco_err:
                logger.warning("COCO trace export failed for run %s: %s", run_id, coco_err)
        except Exception as e:
            logger.warning("Trace filter failed for run %s: %s", run_id, e)

    t = threading.Thread(target=_filter_and_export, daemon=True, name=f"filter-{run_id[:8]}")
    t.start()


def _try_upload_screenshot(screenshot_bytes: bytes, url: str) -> None:
    """Upload screenshot to GCS and update Firestore lastScreenshotUrl if env vars are set."""
    try:
        from screenshot_stream import upload_screenshot
        upload_screenshot(screenshot_bytes, url)
    except Exception as e:
        logger.debug("Screenshot upload skipped: %s", e)


def _upload_trace_screenshot(run_ref, step_index: int, screenshot_bytes: bytes) -> str | None:
    """Upload per-step screenshot to GCS for COCO trace export. Returns gs:// URL or None."""
    try:
        workflow_id = run_ref.parent.id
        run_id = run_ref.id
        bucket_name = os.environ.get("ECHO_GCS_BUCKET") or os.environ.get("GCS_BUCKET")
        if not bucket_name:
            return None
        blob_name = f"traces/{workflow_id}/{run_id}/step_{step_index}.png"
        from google.cloud import storage
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        blob.upload_from_string(screenshot_bytes, content_type="image/png")
        return f"gs://{bucket_name}/{blob_name}"
    except Exception as e:
        logger.debug("Trace screenshot upload skipped: %s", e)
        return None


async def _check_run_signals(run_ref) -> tuple[str | None, bool]:
    """Poll Firestore for redirect instruction or cancel request."""
    snap = await asyncio.to_thread(run_ref.get)
    data = snap.to_dict() or {}
    cancel = data.get("cancel_requested", False)
    redirect = data.get("redirect_instruction")
    if redirect:
        await asyncio.to_thread(run_ref.update, {
            "redirect_instruction": None,
            "redirect_acknowledged_at": SERVER_TIMESTAMP,
        })
    return redirect, cancel


def _step_to_backend_format(step: dict) -> dict:
    return {
        "action": step.get("action", ""),
        "params": step.get("params", {}),
        "context": step.get("context", ""),
        "expected_outcome": step.get("expected_outcome", ""),
    }


async def _run_workflow_websocket(
    run_ref,
    steps: list[dict],
    workflow_type: str,
    owner_uid: str,
    db,
    backend_url: str,
    job_connect_token: str,
) -> tuple[bool, str | None]:
    """
    Run workflow via WebSocket agent API.
    Returns (success, error_or_calluser_reason).
    """
    import websockets
    from playwright.async_api import async_playwright

    backend_steps = [_step_to_backend_format(s) for s in steps]
    ws_base = backend_url.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_base}/api/agent/run?job_token={job_connect_token}&workflow_id={run_ref.parent.parent.id}&run_id={run_ref.id}"
    workflow_id = run_ref.parent.parent.id
    run_id = run_ref.id

    history: list[dict] = []
    total = len(steps)
    browser = None
    page = None

    try:
        async with async_playwright() as p:
            headless = os.environ.get("HEADLESS", "true").lower() in ("1", "true", "yes")
            browser = await p.chromium.launch(
                headless=headless,
                args=["--disable-blink-features=AutomationControlled", "--disable-gpu"],
            )
            ctx = await browser.new_context()
            page = await ctx.new_page()
            await page.set_viewport_size({"width": 1280, "height": 936})
            await page.goto("https://www.google.com")

            operator = PlaywrightOperator(page)

            async with websockets.connect(ws_url, ping_interval=30, ping_timeout=10) as ws:

                async def _send(msg: dict) -> None:
                    await ws.send(json.dumps(msg))

                async def _receive() -> dict:
                    raw = await ws.recv()
                    return json.loads(raw)

                await _send({
                    "type": "start",
                    "workflow_id": workflow_id,
                    "run_id": run_id,
                    "workflow_type": workflow_type,
                    "steps": backend_steps,
                })

                msg = await _receive()
                if msg.get("type") == "error":
                    return False, msg.get("message", "Agent error")
                if msg.get("type") != "ready":
                    return False, "Unexpected agent response"

                for i in range(total):
                    redirect, cancel = await _check_run_signals(run_ref)
                    if cancel:
                        await log_message(run_ref, "Run cancelled by user request")
                        await asyncio.to_thread(run_ref.update, {
                            "status": "cancelled",
                            "completedAt": SERVER_TIMESTAMP,
                        })
                        return True, "__cancelled__"
                    if redirect and i > 0:
                        await log_message(run_ref, f"Redirect received: {redirect}")
                        steps[i] = {**steps[i], "context": f"[User redirect]: {redirect}\n{steps[i].get('context', '')}"}
                        backend_steps[i] = _step_to_backend_format(steps[i])

                    step = steps[i]
                    step_index = i + 1
                    step_label = f"Step {step_index}/{total}: {step.get('action', '')} — {step.get('context', '')[:60]}"
                    await log_message(run_ref, step_label)

                    deterministic = is_deterministic(step)
                    last_error = ""
                    step_succeeded = False

                    for attempt in range(4):
                        screenshot_b64: str | None = None
                        if not deterministic:
                            try:
                                screenshot_bytes = await page.screenshot(type="png", full_page=False)
                                screenshot_b64 = base64.b64encode(screenshot_bytes).decode("ascii")
                            except Exception as e:
                                last_error = f"Screenshot failed: {e}"
                                break

                        payload: dict = {
                            "type": "step",
                            "step_index": i,
                            "step": backend_steps[i],
                            "history_summary": "",
                            "last_error": last_error or "",
                        }
                        if screenshot_b64:
                            payload["screenshot_b64"] = screenshot_b64

                        await _send(payload)

                        while True:
                            msg = await _receive()
                            if msg.get("type") == "thinking":
                                await log_message(run_ref, msg.get("thought", ""), metadata={"step_index": i})
                                continue
                            break

                        if msg.get("type") == "error":
                            last_error = msg.get("message", "Agent error")
                            if attempt < 3:
                                await asyncio.sleep(0.5 * (2 ** attempt))
                            continue

                        if msg.get("type") == "action":
                            signal = msg.get("signal", "")
                            thought = msg.get("thought", "")

                            if signal == "finished":
                                await log_message(run_ref, f"Agent signaled Finished at step {step_index}. Thought: {thought}")
                                await asyncio.to_thread(run_ref.update, {"status": "completed", "completedAt": SERVER_TIMESTAMP})
                                return True, "__finished_early__"

                            if signal == "calluser":
                                reason = msg.get("reason", "Agent needs user intervention")
                                await log_message(run_ref, f"Agent needs user help at step {step_index}: {reason}", level="warn")
                                await asyncio.to_thread(run_ref.update, {
                                    "status": "awaiting_user",
                                    "callUserReason": reason,
                                    "pausedAt": SERVER_TIMESTAMP,
                                })
                                return True, f"__calluser__:{reason}"

                            if signal == "step_done":
                                step_succeeded = True
                                break

                            if signal == "execute" and msg.get("action"):
                                action = msg["action"]
                                try:
                                    exec_result = await operator.execute(action)
                                except Exception as e:
                                    last_error = str(e)
                                    if attempt < 3:
                                        await asyncio.sleep(0.5 * (2 ** attempt))
                                    continue

                                if exec_result == "finished":
                                    await asyncio.to_thread(run_ref.update, {"status": "completed", "completedAt": SERVER_TIMESTAMP})
                                    return True, "__finished_early__"
                                if exec_result == "calluser":
                                    await asyncio.to_thread(run_ref.update, {
                                        "status": "awaiting_user",
                                        "callUserReason": "Operator returned calluser",
                                        "pausedAt": SERVER_TIMESTAMP,
                                    })
                                    return True, "__calluser__:Operator returned calluser"
                                if exec_result is False:
                                    last_error = "Operator returned false"
                                    if attempt < 3:
                                        await asyncio.sleep(0.5 * (2 ** attempt))
                                    continue

                                if deterministic:
                                    step_succeeded = True
                                    break

                                before_b64 = screenshot_b64
                                await asyncio.sleep(1)
                                try:
                                    after_bytes = await page.screenshot(type="png", full_page=False)
                                    after_b64 = base64.b64encode(after_bytes).decode("ascii")
                                except Exception:
                                    after_b64 = before_b64 or ""

                                action_str = msg.get("action_str", "")
                                expected = steps[i].get("expected_outcome", "")

                                await _send({
                                    "type": "verify",
                                    "before_b64": before_b64,
                                    "after_b64": after_b64,
                                    "action_str": action_str,
                                    "expected_outcome": expected,
                                })

                                while True:
                                    vmsg = await _receive()
                                    if vmsg.get("type") == "thinking":
                                        continue
                                    break

                                if vmsg.get("type") == "verify_result" and vmsg.get("succeeded"):
                                    step_succeeded = True
                                    break
                                last_error = vmsg.get("description", "Verification failed")
                                if attempt < 3:
                                    await asyncio.sleep(0.5 * (2 ** attempt))
                                    continue

                        if step_succeeded:
                            break

                    if not step_succeeded:
                        reason = last_error or f"Step {step_index} failed"
                        await log_message(run_ref, f"Stuck at step {step_index} — requesting user intervention: {reason}", level="warn")
                        await asyncio.to_thread(run_ref.update, {
                            "status": "awaiting_user",
                            "callUserReason": reason,
                            "pausedAt": SERVER_TIMESTAMP,
                        })
                        return True, f"__calluser__:{reason}"

                    await log_message(run_ref, f"✓ Step {step_index} complete")
                    try:
                        screenshot = await page.screenshot(type="png", full_page=False)
                        _try_upload_screenshot(screenshot, page.url)
                        _upload_trace_screenshot(run_ref, i, screenshot)
                        history.append({"screenshot": compress_screenshot(screenshot)})
                    except Exception:
                        pass
                    await asyncio.sleep(0.3)

            await ctx.close()

    except asyncio.TimeoutError:
        logger.error("Workflow execution timed out after %ds", WORKFLOW_TIMEOUT_SECS)
        return False, f"Workflow timed out after {WORKFLOW_TIMEOUT_SECS}s"
    except Exception as e:
        logger.exception("WebSocket workflow failed: %s", e)
        return False, str(e)
    finally:
        if browser:
            try:
                await browser.close()
            except Exception:
                pass

    return True, None


def main():
    workflow_id = os.environ.get("WORKFLOW_ID")
    run_id = os.environ.get("RUN_ID")
    owner_uid = os.environ.get("OWNER_UID")
    if not all([workflow_id, run_id, owner_uid]):
        logger.error("Missing WORKFLOW_ID, RUN_ID, or OWNER_UID")
        return 1

    backend_url = (
        os.environ.get("ECHO_API_URL")
        or os.environ.get("BACKEND_URL")
        or "http://localhost:8000"
    )
    logger.info("Backend URL: %s", backend_url)

    logger.info("Initializing Firebase...")
    firebase_project = os.environ.get("FIREBASE_PROJECT_ID", "")
    sa_path = os.environ.get("ECHO_GOOGLE_APPLICATION_CREDENTIALS") or os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS", ""
    )
    cred = credentials.Certificate(sa_path) if sa_path else credentials.ApplicationDefault()
    opts = {"projectId": firebase_project} if firebase_project else {}
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, opts)
    db = firestore.client()

    run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
    workflow_ref = db.collection("workflows").document(workflow_id)
    workflow_doc = workflow_ref.get()
    if not workflow_doc.exists or workflow_doc.to_dict().get("owner_uid") != owner_uid:
        logger.error("Workflow not found or access denied")
        run_ref.update({"status": "failed", "error": "Workflow not found or access denied"})
        return 1

    run_doc = run_ref.get()
    run_data = run_doc.to_dict() or {}
    job_connect_token = run_data.get("job_connect_token")
    if not job_connect_token:
        logger.error("job_connect_token not found in run doc — run may have been started without it")
        run_ref.update({"status": "failed", "error": "job_connect_token not found"})
        return 1

    steps_snap = workflow_ref.collection("steps").order_by("order").stream()
    steps = [{"id": s.id, **s.to_dict()} for s in steps_snap]

    run_ref.update({"status": "running", "startedAt": SERVER_TIMESTAMP})

    workflow_type = workflow_doc.to_dict().get("workflow_type", "browser")

    logger.info("Starting workflow with %d steps (WebSocket agent, type=%s)", len(steps), workflow_type)

    success, error = asyncio.run(asyncio.wait_for(
        _run_workflow_websocket(
            run_ref, steps,
            workflow_type=workflow_type,
            owner_uid=owner_uid,
            db=db,
            backend_url=backend_url,
            job_connect_token=job_connect_token,
        ),
        timeout=WORKFLOW_TIMEOUT_SECS,
    ))

    if error == "__finished_early__":
        _trigger_trace_filter(run_ref, workflow_id, run_id, db, owner_uid)
        return 0

    if isinstance(error, str) and error.startswith("__calluser__:"):
        logger.info("Run paused awaiting user: %s", error[len("__calluser__:"):])
        _trigger_trace_filter(run_ref, workflow_id, run_id, db, owner_uid)
        return 0

    if isinstance(error, str) and error == "__cancelled__":
        _trigger_trace_filter(run_ref, workflow_id, run_id, db, owner_uid)
        return 0

    if not success:
        logger.error("Workflow execution failed: %s", error)
        run_ref.update({
            "status": "failed",
            "error": error or "Unknown error",
            "completedAt": SERVER_TIMESTAMP,
        })
        _trigger_trace_filter(run_ref, workflow_id, run_id, db, owner_uid)
        return 1

    run_ref.update({"status": "completed", "completedAt": SERVER_TIMESTAMP})
    _trigger_trace_filter(run_ref, workflow_id, run_id, db, owner_uid)
    return 0


if __name__ == "__main__":
    try:
        exit(main())
    except Exception as e:
        logger.exception("Unhandled error: %s", e)
        sys.exit(1)
