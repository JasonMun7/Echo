#!/usr/bin/env python3
"""
Echo Workflow Executor — runs via EchoPrism (DirectExecutor + echo_prism_agent).
Env: WORKFLOW_ID, RUN_ID, OWNER_UID, GEMINI_API_KEY
"""
import asyncio
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

from direct_executor import execute_step, is_deterministic
from echo_prism.alpha.agent import (
    FALLBACK_MODEL,
    _cache_system_prompt,
    _get_client,
    _resolve_model,
    run_ambiguous_step,
)
from echo_prism.alpha.image_utils import compress_screenshot
from echo_prism.alpha.perception import perceive_scene
from echo_prism.alpha.prompts import WorkflowType, step_instruction, system_prompt

# Total workflow execution timeout: 5 minutes
WORKFLOW_TIMEOUT_SECS = 300


async def log_message(run_ref, message: str, level: str = "info", metadata: dict | None = None):
    """Append a log entry to runs/{run_id}/logs (non-blocking via asyncio.to_thread).

    metadata: optional dict of structured fields (e.g. thought, action, step_index)
    for trace logging (o, t, a) per step.
    """
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
            # Export COCO trace after scoring (so we have quality/corrected_thought)
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


async def _handle_echoprism_result(
    result,
    err: str | None,
    thought: str | None,
    action_str: str | None,
    step_index: int,
    run_ref,
    page,
    ctx,
    browser,
    history: list[dict],
) -> tuple[bool | None, str | None]:
    """
    Handle the return value from run_ambiguous_step.

    Returns:
        (None, None)        — step succeeded, continue loop
        (True, sentinel)    — step signaled early termination (finished/calluser), break loop
        (False, error)      — step failed permanently, break loop
    """
    trace_meta: dict = {
        "step_index": step_index,
        "thought": thought or "",
        "action": action_str or "",
        "trace": True,
    }

    if result == "finished":
        await log_message(
            run_ref,
            f"Agent signaled Finished at step {step_index}. Thought: {thought}",
            metadata=trace_meta,
        )
        await asyncio.to_thread(
            run_ref.update,
            {"status": "completed", "completedAt": SERVER_TIMESTAMP},
        )
        await log_message(run_ref, "Workflow completed successfully (agent Finished signal)")
        return True, "__finished_early__"

    if result == "calluser":
        reason = err or "Agent requested user intervention"
        await log_message(
            run_ref,
            f"Agent needs user help at step {step_index}: {reason}",
            level="warn",
            metadata={**trace_meta, "callUserReason": reason},
        )
        await asyncio.to_thread(
            run_ref.update,
            {
                "status": "awaiting_user",
                "callUserReason": reason,
                "pausedAt": SERVER_TIMESTAMP,
            },
        )
        return True, f"__calluser__:{reason}"

    if result is False:
        await log_message(
            run_ref,
            f"✗ Step {step_index} failed: {err}",
            level="error",
            metadata={**trace_meta, "error": err},
        )
        return False, err or f"EchoPrism failed at step {step_index}"

    # result is True — step succeeded; persist thought+action in history
    # EchoPrism-Voice: update current_step for status feed (Voice reads this for TTS)
    try:
        screenshot = await page.screenshot(type="png", full_page=False)
        _try_upload_screenshot(screenshot, page.url)
        # Upload per-step screenshot for COCO trace export
        screenshot_url = _upload_trace_screenshot(run_ref, step_index, screenshot)
        if screenshot_url:
            trace_meta["screenshot_url"] = screenshot_url
        # Compress before storing in history to save memory
        history.append({
            "screenshot": compress_screenshot(screenshot),
            "thought": thought or "",
            "action": action_str or "",
        })
    except Exception:
        pass
    # Update current_step for EchoPrism-Voice status feed
    try:
        await asyncio.to_thread(run_ref.update, {
            "current_step": step_index,
            "current_step_thought": (thought or "")[:200],
            "current_step_action": (action_str or "")[:100],
        })
    except Exception:
        pass

    await log_message(
        run_ref,
        f"✓ Step {step_index} complete (EchoPrism). Thought: {(thought or '')[:100]}",
        metadata=trace_meta,
    )

    return None, None


async def _check_run_signals(run_ref) -> tuple[str | None, bool]:
    """Poll Firestore for redirect instruction or cancel request.
    Called between steps. Returns (redirect_instruction or None, cancel_requested bool).
    """
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


async def _run_echoprism_hybrid(
    run_ref,
    steps: list[dict],
    workflow_type: str = "browser",
    owner_uid: str | None = None,
    db=None,
) -> tuple[bool, str | None]:
    """
    Run workflow using DirectExecutor for deterministic steps, EchoPrism for ambiguous.

    Returns (success, error_or_calluser_reason).
    Side effects:
      - Logs structured (thought, action, step_index) trace entries to Firestore
      - Uploads screenshots to GCS via screenshot_stream after each EchoPrism step
      - Updates run status to "awaiting_user" + callUserReason when agent signals CallUser

    Performance optimizations applied here:
      - System prompt context cache: uploaded once, referenced via cache name on every call
      - Speculative prefetch: perceive_scene() for the next step is fired as an asyncio.Task
        during operator.execute() + verification of the current step, hiding 2-4s of Tier 1
        latency on most steps (effectively making perceive_scene free in the happy path)
    """
    from playwright.async_api import async_playwright

    api_key = os.environ.get("GEMINI_API_KEY", "")
    client = _get_client(api_key) if api_key else None

    browser = None
    ctx = None
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=False,
                args=["--disable-blink-features=AutomationControlled", "--disable-gpu"],
            )
            try:
                ctx = await browser.new_context()
                page = await ctx.new_page()
                await page.set_viewport_size({"width": 1280, "height": 936})
                await page.goto("https://www.google.com")

                # Cache the system prompt once for the whole workflow run.
                # All steps share the same system prompt (same workflow_type + action space).
                # With 10 steps × 3 retries = up to 30 calls, this saves ~45k tokens.
                cached_prompt: str | None = None
                model = _resolve_model(owner_uid, db)
                if client and steps:
                    first_step = steps[0]
                    sys = system_prompt(step_instruction(first_step, 1, len(steps)), workflow_type)  # type: ignore[arg-type]
                    cached_prompt = _cache_system_prompt(client, sys, model)
                    if cached_prompt:
                        logger.info("System prompt context cache active for this run: %s", cached_prompt)
                    else:
                        logger.debug("Context cache not available — system prompt will be sent inline")

                # (o, t, a) history for multi-step context
                history: list[dict] = []
                total = len(steps)

                async def _prefetch_scene(screenshot: bytes) -> str:
                    """Fire perceive_scene in background; returns caption or ''."""
                    try:
                        from echo_prism.alpha.image_utils import compress_screenshot as _compress
                        compressed = _compress(screenshot)
                        return await perceive_scene(client, compressed, "gemini-2.5-flash")
                    except Exception:
                        return ""

                async def _run_steps():
                    prefetch_task: asyncio.Task | None = None
                    prefetched_caption: str | None = None

                    for i, step in enumerate(steps, 1):
                        # Inter-step signal poll: check for cancel or mid-run redirect
                        if i > 1:
                            redirect, cancel = await _check_run_signals(run_ref)
                            if cancel:
                                await log_message(run_ref, "Run cancelled by user request")
                                await asyncio.to_thread(run_ref.update, {
                                    "status": "cancelled",
                                    "completedAt": SERVER_TIMESTAMP,
                                })
                                return True, "__cancelled__"
                            if redirect:
                                await log_message(run_ref, f"Redirect received: {redirect}", level="info")
                                step = {**step, "context": f"[User redirect]: {redirect}\n{step.get('context', '')}"}

                        step_label = f"Step {i}/{total}: {step.get('action', '')} — {step.get('context', '')[:60]}"
                        await log_message(run_ref, step_label)

                        # Collect prefetched caption from previous iteration (if any)
                        if prefetch_task is not None:
                            try:
                                prefetched_caption = await prefetch_task
                            except Exception:
                                prefetched_caption = None
                            prefetch_task = None
                        else:
                            prefetched_caption = None

                        if is_deterministic(step):
                            MAX_DIRECT_RETRIES = 3
                            ok = False
                            direct_err = ""
                            for attempt in range(MAX_DIRECT_RETRIES):
                                ok, direct_err = await execute_step(page, step)
                                if ok:
                                    break
                                if attempt < MAX_DIRECT_RETRIES - 1:
                                    wait_secs = 2 ** attempt
                                    await log_message(
                                        run_ref,
                                        f"Direct retry {attempt + 1}/{MAX_DIRECT_RETRIES} for step {i} "
                                        f"({step.get('action')}): {direct_err}",
                                        level="warn",
                                    )
                                    await asyncio.sleep(wait_secs)

                            if ok:
                                await log_message(run_ref, f"✓ Step {i} complete (direct)")
                                try:
                                    screenshot = await page.screenshot(type="png", full_page=False)
                                    _try_upload_screenshot(screenshot, page.url)
                                    history.append({"screenshot": compress_screenshot(screenshot)})

                                    # Speculative prefetch: while we have some idle time after
                                    # a direct step succeeds, kick off scene understanding for
                                    # the next EchoPrism step in the background.
                                    if client and i < total and not is_deterministic(steps[i]):
                                        prefetch_task = asyncio.create_task(_prefetch_scene(screenshot))
                                except Exception:
                                    pass
                            else:
                                # All direct retries exhausted — hand off to EchoPrism
                                await log_message(
                                    run_ref,
                                    f"Direct failed after {MAX_DIRECT_RETRIES} retries for step {i} "
                                    f"— falling back to EchoPrism. Last error: {direct_err}",
                                    level="warn",
                                )
                                result, thought, action_str, err = await run_ambiguous_step(
                                    page, step, i, total, history,
                                    workflow_type=workflow_type,  # type: ignore[arg-type]
                                    owner_uid=owner_uid,
                                    db=db,
                                    cached_prompt=cached_prompt,
                                    prefetched_caption=prefetched_caption,
                                )
                                status, signal = await _handle_echoprism_result(
                                    result, err, thought, action_str, i, run_ref, page, ctx, browser, history
                                )
                                if status is not None:
                                    return status, signal

                                # Speculative prefetch for next step after EchoPrism finishes
                                if client and i < total and not is_deterministic(steps[i]):
                                    try:
                                        after_ss = await page.screenshot(type="png", full_page=False)
                                        prefetch_task = asyncio.create_task(_prefetch_scene(after_ss))
                                    except Exception:
                                        pass

                        else:
                            result, thought, action_str, err = await run_ambiguous_step(
                                page, step, i, total, history,
                                workflow_type=workflow_type,  # type: ignore[arg-type]
                                owner_uid=owner_uid,
                                db=db,
                                cached_prompt=cached_prompt,
                                prefetched_caption=prefetched_caption,
                            )
                            status, signal = await _handle_echoprism_result(
                                result, err, thought, action_str, i, run_ref, page, ctx, browser, history
                            )
                            if status is not None:
                                return status, signal

                            # Speculative prefetch for next step
                            if client and i < total and not is_deterministic(steps[i]):
                                try:
                                    after_ss = await page.screenshot(type="png", full_page=False)
                                    prefetch_task = asyncio.create_task(_prefetch_scene(after_ss))
                                except Exception:
                                    pass

                    # Cancel any outstanding prefetch task at end of workflow
                    if prefetch_task is not None:
                        prefetch_task.cancel()

                    return True, None

                # Apply 5-minute total workflow timeout
                result_pair = await asyncio.wait_for(_run_steps(), timeout=WORKFLOW_TIMEOUT_SECS)
                return result_pair

            finally:
                if ctx:
                    try:
                        await ctx.close()
                    except Exception:
                        pass
                if browser:
                    try:
                        await browser.close()
                    except Exception:
                        pass
    except asyncio.TimeoutError:
        logger.error("Workflow execution timed out after %ds", WORKFLOW_TIMEOUT_SECS)
        return False, f"Workflow timed out after {WORKFLOW_TIMEOUT_SECS}s"
    except Exception as e:
        logger.exception("EchoPrism hybrid execution failed: %s", e)
        return False, str(e)


def main():
    workflow_id = os.environ.get("WORKFLOW_ID")
    run_id = os.environ.get("RUN_ID")
    owner_uid = os.environ.get("OWNER_UID")
    if not all([workflow_id, run_id, owner_uid]):
        logger.error("Missing WORKFLOW_ID, RUN_ID, or OWNER_UID")
        return 1

    if not os.environ.get("GEMINI_API_KEY"):
        logger.error("GEMINI_API_KEY is required for EchoPrism")
        return 1

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

    steps_snap = workflow_ref.collection("steps").order_by("order").stream()
    steps = [{"id": s.id, **s.to_dict()} for s in steps_snap]

    run_ref.update({"status": "running", "startedAt": SERVER_TIMESTAMP})

    workflow_type = workflow_doc.to_dict().get("workflow_type", "browser")

    logger.info("Starting workflow with %d steps (EchoPrism hybrid, type=%s)", len(steps), workflow_type)
    success, error = asyncio.run(_run_echoprism_hybrid(
        run_ref, steps, workflow_type=workflow_type, owner_uid=owner_uid, db=db
    ))

    # "__finished_early__" means the agent called Finished() mid-run and already updated Firestore
    if error == "__finished_early__":
        _trigger_trace_filter(run_ref, workflow_id, run_id, db, owner_uid)
        return 0

    # "__calluser__:reason" means the run is now awaiting_user — Firestore already updated
    if isinstance(error, str) and error.startswith("__calluser__:"):
        logger.info("Run paused awaiting user: %s", error[len("__calluser__:"):])
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
