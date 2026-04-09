"""LangGraph node functions and legacy single-node helpers."""

from __future__ import annotations

import hashlib
import logging
import os
from io import BytesIO
from typing import Any, Literal

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END
from langgraph.types import Command

from echo_prism_agent.model_prompts import history_summary_text
from echo_prism_agent.synthesis.pipeline import synthesize_workflow_from_media
from echo_prism_agent.constants import (
    DEFAULT_GUI_RUN_MAX_LOOPS,
    MAX_CONTEXT_IMAGES,
    MAX_INFERENCE_FAILURES,
    MAX_RETRIES,
)
from echo_prism_agent.ui_tars.screenshot_pipeline import (
    build_context,
    compress_screenshot,
    vlm_resize_dimensions,
)
from echo_prism_agent.utils.state import (
    ChatTurnState,
    GuiRunState,
    InferenceStepState,
    SynthesisGraphState,
)

logger = logging.getLogger(__name__)

try:
    from PIL import Image

    HAS_PIL = True
except ImportError:
    HAS_PIL = False


# --- Chat turn -----------------------------------------------------------------


async def chat_turn_node(state: ChatTurnState) -> dict[str, Any]:
    from echo_prism_agent.utils.tools import process_chat_turn

    text_resp, fn_calls, model_content = await process_chat_turn(
        state["history"], state["client"], state["model"]
    )
    return {
        "text_resp": text_resp,
        "fn_calls": fn_calls,
        "model_content": model_content,
    }


# --- Inference: context (observe) ----------------------------------------------


def observe_screen(state: InferenceStepState) -> dict[str, Any]:
    """Read image dimensions and compressed screenshot bytes."""
    raw = state["screenshot_bytes"]
    w, h = 1920, 1080
    if HAS_PIL:
        try:
            im = Image.open(BytesIO(raw))
            w, h = im.size
        except Exception as e:
            logger.debug(
                "observe_screen: could not read raw screenshot dimensions; using default %sx%s: %s",
                w,
                h,
                e,
            )
    img_bytes = compress_screenshot(raw)
    vw, vh = vlm_resize_dimensions(w, h)
    # Must match the image actually sent to the VLM. ``compress_screenshot`` and
    # ``vlm_resize_dimensions`` can disagree when v1.5 resize returns None (extreme
    # aspect) and compress keeps raw size while the latter falls back to ``smart_resize``.
    if HAS_PIL:
        try:
            im2 = Image.open(BytesIO(img_bytes))
            aw, ah = im2.size
            if (aw, ah) != (vw, vh):
                logger.warning(
                    "observe_screen: using compressed image size %sx%s for coord remap "
                    "(vlm_resize_dimensions was %sx%s)",
                    aw,
                    ah,
                    vw,
                    vh,
                )
            vw, vh = aw, ah
        except Exception as e:
            logger.warning("observe_screen: could not read compressed dimensions: %s", e)
    elif (os.environ.get("ECHOPRISM_DEBUG_VLM_DIMS") or "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    ):
        logger.warning("observe_screen: PIL unavailable; vlm dims may not match compressed image")
    return {
        "screen_width_px": w,
        "screen_height_px": h,
        "vlm_resize_width": vw,
        "vlm_resize_height": vh,
        "img_bytes": img_bytes,
    }


def build_history_context(state: InferenceStepState) -> dict[str, Any]:
    """Prior-step screenshots and summary text for multimodal think."""
    history = state.get("history") or []
    history_text = ""
    extra_images: list[bytes] | None = None
    if history:
        try:
            screenshots, summary = build_context(history, n_images=MAX_CONTEXT_IMAGES)
            history_text = history_summary_text(summary)
            extra_images = screenshots if screenshots else None
        except ValueError as e:
            logger.debug(
                "build_history_context: invalid history context; using empty fallback: %s", e
            )
    return {
        "history_text": history_text,
        "extra_images": extra_images,
    }


# --- Inference: OpenRouter + UI-TARS (UI-TARS-desktop ``UITarsModel`` pattern) ---


async def think_llm(
    state: InferenceStepState,
    _config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """OpenRouter vision call (chat/completions) — same stack as UI-TARS-desktop local runs."""
    from echo_prism_agent.model_prompts import system_prompt
    from echo_prism_agent.ui_tars.openrouter_vision import chat_completions_vision
    from echo_prism_agent.ui_tars.screenshot_pipeline import compress_screenshot

    sys = system_prompt(
        state["instruction"],
        state.get("workflow_type", "desktop") or "desktop",
    )
    user_parts: list[str] = []
    if state.get("history_text"):
        user_parts.append(f"Prior steps summary:\n{state['history_text']}\n")
    if state.get("extra_context"):
        user_parts.append(state["extra_context"])
    user_parts.append(
        "Current screenshot is attached. Output Thought: then Action: following the system contract."
    )
    user_text = "\n".join(user_parts)
    extra_raw = state.get("extra_images") or []
    extra_compressed = [compress_screenshot(b) for b in extra_raw] if extra_raw else None
    primary = state.get("img_bytes") or state.get("screenshot_bytes") or b""
    raw, err = await chat_completions_vision(
        system=sys,
        user_text=user_text,
        image_png_bytes=primary,
        extra_image_parts=extra_compressed,
    )
    if err:
        return {"raw_text": "", "error": err}
    return {"raw_text": raw or "", "error": None}


def _extra_context_for_retry(message: str) -> str:
    return f"Previous attempt failed: {message}\nTry a clearly different action."


def parse_and_validate(
    state: InferenceStepState,
) -> Command | dict[str, Any]:
    """Parse UI-TARS ``Thought``/``Action`` output; ``Command`` back to ``think_llm`` on retry."""
    from echo_prism_agent.ui_tars.coords import apply_post_inference_vlm_coords
    from echo_prism_agent.ui_tars.parse_actions import extract_thought, parse_action

    fc = int(state.get("failure_count") or 0)
    max_f = int(state.get("max_failures") or MAX_INFERENCE_FAILURES)

    def _exhausted_error(message: str) -> dict[str, Any]:
        raw = state.get("raw_text") or ""
        return {
            "error": message,
            "thought": extract_thought(raw),
            "parsed": None,
        }

    def _retry_think(message: str) -> Command | dict[str, Any]:
        nfc = fc + 1
        if nfc >= max_f:
            return _exhausted_error(message)
        return Command(
            update={
                "failure_count": nfc,
                "extra_context": _extra_context_for_retry(message),
                "raw_text": "",
                "error": None,
                "parsed": None,
                "thought": "",
            },
            goto="think_llm",
        )

    err = state.get("error")
    if err:
        return _retry_think(str(err))

    raw = state.get("raw_text") or ""
    thought = extract_thought(raw)
    parsed = parse_action(raw)

    if not parsed:
        return _retry_think(f"Could not parse action from model output: {raw[:200]}")

    vw = int(state.get("vlm_resize_width") or 0)
    vh = int(state.get("vlm_resize_height") or 0)
    parsed = apply_post_inference_vlm_coords(parsed, vlm_w=vw, vlm_h=vh)

    action = (parsed.get("action") or "").lower()
    if action == "finished":
        return {"thought": thought, "parsed": parsed, "error": None}

    if action == "calluser":
        msg = (thought.strip() if thought else "Model attempted CallUser") + " — try a different approach"
        nfc = fc + 1
        if nfc >= max_f:
            return {
                "thought": thought,
                "parsed": parsed,
                "error": None,
                "inference_terminal": "calluser_exhausted",
            }
        return Command(
            update={
                "failure_count": nfc,
                "extra_context": _extra_context_for_retry(msg),
                "raw_text": "",
                "error": None,
                "parsed": None,
                "thought": "",
            },
            goto="think_llm",
        )

    return {"thought": thought, "parsed": parsed, "error": None, "inference_terminal": None}


# --- GUI run (multi-step loop: inference → execute → verify) --------------------


def _screenshot_hash(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def screenshots_pixels_changed(before: bytes, after: bytes) -> tuple[str, bool]:
    """Diagnostics only: MD5 equality check (not used to gate the agent loop)."""
    if _screenshot_hash(before) != _screenshot_hash(after):
        return "Pixel change detected between before and after screenshots", True
    return "Screenshots identical — no visible change detected", False


def gui_run_prepare(state: GuiRunState) -> dict[str, Any]:
    """Initialize loop metadata and before/after observation anchors."""
    shot = state.get("screenshot_bytes") or b""
    max_loops = state.get("max_loop_count")
    if max_loops is None:
        max_loops = int(os.environ.get("ECHOPRISM_GUI_RUN_MAX_LOOPS", str(DEFAULT_GUI_RUN_MAX_LOOPS)))
    muscle_replay = bool(state.get("muscle_replay_active"))
    if not muscle_replay:
        muscle_replay = os.environ.get("ECHOPRISM_MUSCLE_REPLAY", "").strip().lower() in ("1", "true", "yes")
    cache_clear = state.get("cache_clear_on_fail")
    if cache_clear is None:
        cache_clear = os.environ.get("ECHOPRISM_CACHE_CLEAR_ON_FAIL", "1").strip().lower() in (
            "1",
            "true",
            "yes",
            "",
        )
    pm_key = state.get("procedural_memory_key")
    if pm_key is None and state.get("thread_label"):
        pm_key = str(state.get("thread_label"))
    return {
        "before_screenshot_bytes": state.get("before_screenshot_bytes") or shot,
        "loop_count": int(state.get("loop_count") or 0),
        "max_loop_count": max_loops,
        "verify_failure_count": int(state.get("verify_failure_count") or 0),
        "max_verify_retries": int(state.get("max_verify_retries") or 3),
        "gui_run_terminal": state.get("gui_run_terminal"),
        "gui_error": state.get("gui_error"),
        "execute_skipped": False,
        "muscle_replay_active": muscle_replay,
        "cache_clear_on_fail": bool(cache_clear),
        "procedural_memory_key": pm_key,
        "outcome_met": state.get("outcome_met"),
    }


async def gui_run_execute(state: GuiRunState, config: RunnableConfig | None = None) -> dict[str, Any]:
    """
    Apply parsed action via optional `gui_execute_fn` in config.configurable.
    Transient failures: covered by RetryPolicy on this node in the graph builder.
    """
    cfg = (config or {}).get("configurable") or {}
    execute_fn = cfg.get("gui_execute_fn")
    parsed = state.get("parsed") or {}
    action = (parsed.get("action") or "").lower()

    if action == "finished":
        return {"gui_run_terminal": "finished", "after_screenshot_bytes": state.get("screenshot_bytes"), "execute_skipped": True}

    if execute_fn is None:
        # Tests / dry-run: no desktop bridge — treat as no-op so verify can pass.
        return {
            "after_screenshot_bytes": state.get("screenshot_bytes"),
            "execute_skipped": True,
        }

    try:
        out = await execute_fn(state, parsed)
    except Exception as e:
        logger.exception("gui_run_execute failed")
        return {"gui_run_terminal": "error", "gui_error": str(e), "after_screenshot_bytes": None}

    if not isinstance(out, dict):
        return {"gui_run_terminal": "error", "gui_error": "gui_execute_fn must return a dict", "after_screenshot_bytes": None}

    after = out.get("after_screenshot_bytes") or out.get("screenshot_bytes")
    if after is None:
        return {"gui_run_terminal": "error", "gui_error": "execute_fn must return after_screenshot_bytes", "after_screenshot_bytes": None}

    return {"after_screenshot_bytes": after, "execute_skipped": False}


async def gui_run_verify(state: GuiRunState, _config: RunnableConfig | None = None) -> dict[str, Any]:
    """
    Verify whether the GUI action produced an acceptable post-action state and return verification metadata.
    
    If execution was skipped this function marks verification as passed. If no after-action screenshot is present it returns a failing verification. When an after screenshot exists it compares pixel buffers for diagnostics but does not treat identical bytes as a hard failure (matches UI-TARS-desktop BrowserGUIAgent behavior); in all cases with an after screenshot the function reports verification success.
    
    Returns:
        dict: {
            "verify_delta_ok" (bool): `True` if verification is considered successful, `False` otherwise;
            "verification_hint" (str): a short human-readable hint or error message (empty string when not applicable);
            "outcome_met" (bool): `True` when the workflow outcome is considered met, `False` otherwise.
        }
    """
    if state.get("execute_skipped"):
        return {"verify_delta_ok": True, "verification_hint": "", "outcome_met": True}

    after = state.get("after_screenshot_bytes")
    if not after:
        return {"verify_delta_ok": False, "verification_hint": "Missing after screenshot", "outcome_met": False}

    before = state.get("before_screenshot_bytes") or state.get("screenshot_bytes") or b""
    _hint, changed = screenshots_pixels_changed(before, after)
    if not changed:
        logger.debug(
            "gui_run_verify: before/after buffers identical; advancing (UI-TARS-desktop BrowserGUIAgent: no pixel gate)"
        )

    return {
        "verify_delta_ok": True,
        "verification_hint": "",
        "outcome_met": True,
    }


def gui_infeasible_optional(state: GuiRunState) -> dict[str, Any]:
    """Placeholder for AgentMm infeasibility pre-check; extend with InfeasibleAgentManager when needed."""
    try:
        from echo_prism_agent.muscle.config import infeasible_node_enabled
    except Exception:
        return {}
    if not infeasible_node_enabled():
        return {}
    logger.info("infeasible_optional node: enabled (stub — no AgentMm run)")
    return {}


def gui_route_after_verify(state: GuiRunState) -> Command:
    """
    Decide the next GUI workflow step after verification of an executed action.
    
    When verification succeeded, advances the GUI loop or ends the run if the max loop count is reached; when verification failed, increments a verification retry counter and either schedules another inference attempt with guidance or terminates with an error after exhausting retries.
    
    Returns:
        Command: A LangGraph Command that updates state fields (loop counters, screenshots, transient inference fields, error/terminal flags, and extra_context) and sets the next route (`goto`) to either "inference" or the end marker.
    """
    loop = int(state.get("loop_count") or 0)
    max_loop = int(state.get("max_loop_count") or DEFAULT_GUI_RUN_MAX_LOOPS)
    verify_ok = bool(state.get("verify_delta_ok"))

    if verify_ok:
        next_loop = loop + 1
        if next_loop >= max_loop:
            return Command(
                update={
                    "loop_count": next_loop,
                    "screenshot_bytes": state.get("after_screenshot_bytes"),
                    "before_screenshot_bytes": state.get("after_screenshot_bytes"),
                    "after_screenshot_bytes": None,
                    "gui_run_terminal": "max_loops",
                    "gui_error": "Reached max_loop_count without Finished()",
                    "failure_count": 0,
                    "raw_text": "",
                    "parsed": None,
                    "thought": "",
                    "error": None,
                    "extra_context": "",
                    "verify_failure_count": 0,
                },
                goto=END,
            )

        return Command(
            update={
                "loop_count": next_loop,
                "screenshot_bytes": state["after_screenshot_bytes"],
                "before_screenshot_bytes": state["after_screenshot_bytes"],
                "after_screenshot_bytes": None,
                "extra_context": "",
                "failure_count": 0,
                "raw_text": "",
                "parsed": None,
                "thought": "",
                "error": None,
                "verify_failure_count": 0,
                "inference_terminal": None,
            },
            goto="inference",
        )

    vf = int(state.get("verify_failure_count") or 0)
    max_v = int(state.get("max_verify_retries") or 3)
    if vf >= max_v:
        return Command(
            update={
                "gui_run_terminal": "error",
                "gui_error": state.get("verification_hint") or "verify retries exhausted",
            },
            goto=END,
        )

    hint = (state.get("verification_hint") or "").strip() or "Screen state did not change as expected"
    loop_n = int(state.get("loop_count") or 0)
    extra_ctx = (
        f"Verification failed: {hint} "
        f"(verify retry {vf + 1}, GUI loop {loop_n}). "
        f"Try a clearly different action; do not repeat the same coordinates if the UI did not change."
    )

    return Command(
        update={
            "verify_failure_count": vf + 1,
            "extra_context": extra_ctx,
            "failure_count": 0,
            "raw_text": "",
            "parsed": None,
            "thought": "",
            "error": None,
            "after_screenshot_bytes": None,
        },
        goto="inference",
    )


def gui_tag_end_error(state: GuiRunState) -> dict[str, Any]:
    err = state.get("error") or state.get("gui_error")
    return {"gui_run_terminal": "inference_failed", "gui_error": err or "unknown error"}


def gui_tag_end_success(state: GuiRunState) -> dict[str, Any]:
    _ = state
    return {"gui_run_terminal": "finished", "gui_error": None}


def route_after_inference(state: GuiRunState) -> Literal["execute", "end_error", "end_success"]:
    if state.get("error"):
        return "end_error"
    if state.get("inference_terminal") == "calluser_exhausted":
        return "end_success"
    parsed = state.get("parsed")
    if not parsed:
        return "end_error"
    if (parsed.get("action") or "").lower() == "finished":
        return "end_success"
    return "execute"


# --- Synthesis -----------------------------------------------------------------


async def synthesis_node(state: SynthesisGraphState) -> dict[str, Any]:
    client = state["client"]
    parts = state["parts"]
    try:
        result = await synthesize_workflow_from_media(client, parts)
        return {
            "steps_data": result["steps"],
            "variables": result.get("variables", []),
            "title": result.get("title"),
            "workflow_type": result.get("workflow_type", "browser"),
            "error": None,
        }
    except Exception as e:
        logger.exception("synthesis node failed")
        return {"error": str(e)}


# --- Legacy single-node equivalents --------------------------------------------


def observe_inference(state: InferenceStepState) -> dict[str, Any]:
    """Single-node equivalent of context subgraph (observe_screen → build_history_context)."""
    merged = {**state, **observe_screen(state)}
    return {**merged, **build_history_context(merged)}


async def think_inference(state: InferenceStepState, config: RunnableConfig | None = None) -> dict[str, Any]:
    return await think_llm(state, config)


def act_inference(state: InferenceStepState) -> dict[str, Any]:
    from echo_prism_agent.ui_tars.parse_actions import extract_thought, parse_action

    raw = state.get("raw_text") or ""
    thought = extract_thought(raw)
    parsed = parse_action(raw)
    return {"thought": thought or raw[:2000], "parsed": parsed, "error": state.get("error")}


__all__ = [
    "MAX_RETRIES",
    "act_inference",
    "build_history_context",
    "chat_turn_node",
    "gui_route_after_verify",
    "gui_run_execute",
    "gui_run_prepare",
    "gui_run_verify",
    "gui_infeasible_optional",
    "gui_tag_end_error",
    "gui_tag_end_success",
    "parse_and_validate",
    "think_llm",
    "observe_inference",
    "observe_screen",
    "route_after_inference",
    "screenshots_pixels_changed",
    "synthesis_node",
    "think_inference",
]
