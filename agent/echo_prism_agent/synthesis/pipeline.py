"""
EchoPrism Synthesis Agent — single subagent for all workflow synthesis.

Supports three modes:
1. Media (video/screenshots) → one-shot multimodal → workflow JSON (used by /api/synthesize)
2. Video frames → observe→think→act per frame → workflow JSON
3. Natural language description → workflow steps (JSON)

Uses SYNTHESIS_MODEL from models_config.py.
"""

import asyncio
import hashlib
import json
import logging
import re
from typing import Any

from echo_prism_agent.constants import (
    FRAME_CHANGE_THRESHOLD_DEFAULT,
    FRAME_PIXEL_DIFF_SAMPLE_BYTES,
    HISTORY_CONTEXT_SLICE_CHARS,
    HISTORY_ROLLING_STEPS,
    JSON_ERROR_LOG_TRUNCATE_CHARS,
    MEDIA_SYNTHESIS_TEMPERATURE,
    SYNTHESIS_FRAME_MAX_DIM,
    SYNTHESIS_FRAME_MAX_OUTPUT_TOKENS,
    SYNTHESIS_FRAME_REQUEST_TIMEOUT_S,
    SYNTHESIS_FRAME_TEMPERATURE,
    TITLE_CONTEXT_SLICE_CHARS,
    TITLE_GENERATION_TIMEOUT_S,
    TITLE_MAX_OUTPUT_TOKENS,
    TITLE_MAX_STEPS_FOR_SUMMARY,
)
from echo_prism_agent.model_prompts import (
    FRAME_SINGLE_STEP_SYSTEM,
    FRAME_SINGLE_STEP_USER,
    FROM_DESCRIPTION_PROMPT,
    MEDIA_SYNTHESIS_PROMPT,
)
from echo_prism_agent.models_config import SYNTHESIS_MODEL
from echo_prism_agent.ui_tars.screenshot_pipeline import compress_screenshot

logger = logging.getLogger(__name__)


def _frame_hash(data: bytes) -> str:
    """MD5 hash for fast change detection."""
    return hashlib.md5(data).hexdigest()


def _pixel_diff_ratio(prev: bytes, curr: bytes) -> float:
    """Rough estimate of pixel-level change ratio. Returns value in [0, 1] — higher = more change."""
    if not prev or not curr:
        return 1.0
    if len(prev) != len(curr):
        return 0.5
    n = FRAME_PIXEL_DIFF_SAMPLE_BYTES
    diff = sum(1 for a, b in zip(prev[:n], curr[:n]) if a != b)
    return diff / min(n, len(prev))


def should_process_frame(
    prev_hash: str | None,
    curr_hash: str,
    prev_bytes: bytes | None,
    curr_bytes: bytes,
    change_threshold: float = FRAME_CHANGE_THRESHOLD_DEFAULT,
) -> bool:
    """Frame sampling: only process if >change_threshold visual change from previous."""
    if prev_hash is None:
        return True
    if prev_hash == curr_hash:
        return False
    if prev_bytes and curr_bytes:
        ratio = _pixel_diff_ratio(prev_bytes, curr_bytes)
        return ratio > change_threshold
    return True


def sample_frames(
    frames: list[bytes],
    change_threshold: float = FRAME_CHANGE_THRESHOLD_DEFAULT,
) -> list[tuple[int, bytes]]:
    """Filter frames to only those with >change_threshold visual change."""
    if not frames:
        return []
    result: list[tuple[int, bytes]] = []
    prev_hash: str | None = None
    prev_bytes: bytes | None = None
    for i, frame in enumerate(frames):
        h = _frame_hash(frame)
        if should_process_frame(prev_hash, h, prev_bytes, frame, change_threshold):
            result.append((i, frame))
        prev_hash = h
        prev_bytes = frame
    if not result:
        return [(0, frames[0])]
    return result


def typing_sequence_warnings(steps: list[dict]) -> list[str]:
    """Heuristic warnings when Enter follows click without type_text_at (runtime may lack literal text)."""
    warnings: list[str] = []
    for i in range(1, len(steps)):
        cur = steps[i]
        prev = steps[i - 1]
        a = (cur.get("action") or "").lower().replace("_", "")
        if a != "presskey":
            continue
        pk = str((cur.get("params") or {}).get("key", "")).lower()
        if pk not in ("enter", "return"):
            continue
        prev_a = (prev.get("action") or "").lower().replace("_", "")
        if prev_a == "clickat":
            warnings.append(
                f"Step {i + 1}: press_key after click_at without intervening type_text_at — "
                "consider adding type_text_at with params.text so the run does not rely on the VLM to guess text."
            )
    return warnings


def _log_typing_sequence_warnings(steps: list[dict]) -> None:
    for w in typing_sequence_warnings(steps):
        logger.warning("Workflow typing hint: %s", w)


def _postprocess_steps(steps_data: list[dict]) -> tuple[list[dict], set[str]]:
    """Strip legacy coordinate keys, deduplicate, extract {{variables}}. No bogus coord defaults."""
    variables: set[str] = set()
    processed_steps: list[dict] = []
    prev_key: tuple | None = None
    coord_keys = ("x", "y", "x1", "y1", "x2", "y2")
    for s in steps_data:
        params = dict(s.get("params", {}))
        action = (s.get("action") or "").lower().replace("_", "")
        text_hint = str(params.get("text") or params.get("content") or "").strip()
        preserve_xy_typetext = action == "typetextat" and bool(text_hint)
        for ck in coord_keys:
            if preserve_xy_typetext and ck in ("x", "y"):
                continue
            params.pop(ck, None)
        for val in list(params.values()) + [s.get("context", "")]:
            if isinstance(val, str):
                for m in re.findall(r"\{\{(\w+)\}\}", val):
                    variables.add(m)
        step_key = (s.get("action", ""), json.dumps(params, sort_keys=True))
        if step_key == prev_key:
            continue
        prev_key = step_key
        s_copy = dict(s)
        s_copy["params"] = params
        processed_steps.append(s_copy)
    return processed_steps, variables


async def synthesize_frame_step(
    client: Any,
    frame_bytes: bytes,
    frame_index: int,
    total_frames: int,
    history_text: str = "",
    model: str = SYNTHESIS_MODEL,
) -> tuple[dict[str, Any] | None, str | None, str | None]:
    """Single-frame JSON step (same schema as media synthesis).

    Returns (step_dict or None, workflow_type hint or None, error or None).
    """
    try:
        from google.genai import types as gtypes
    except ImportError:
        return None, None, "google-genai not available"

    compressed = compress_screenshot(frame_bytes, max_dim=SYNTHESIS_FRAME_MAX_DIM)
    user_text = FRAME_SINGLE_STEP_USER.format(idx=frame_index + 1, total=total_frames)
    user_parts: list = []
    if history_text:
        user_parts.append(gtypes.Part.from_text(text=f"Prior steps summary:\n{history_text}"))
    user_parts.extend(
        [
            gtypes.Part.from_text(text=user_text),
            gtypes.Part.from_bytes(data=compressed, mime_type="image/jpeg"),
        ]
    )

    config = gtypes.GenerateContentConfig(
        system_instruction=FRAME_SINGLE_STEP_SYSTEM,
        response_mime_type="application/json",
        temperature=SYNTHESIS_FRAME_TEMPERATURE,
        max_output_tokens=SYNTHESIS_FRAME_MAX_OUTPUT_TOKENS,
    )

    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=[gtypes.Content(role="user", parts=user_parts)],
                config=config,
            ),
            timeout=SYNTHESIS_FRAME_REQUEST_TIMEOUT_S,
        )
        raw = response.text if response and response.text else ""
        if not raw and response and response.candidates:
            for c in response.candidates:
                if c.content and c.content.parts:
                    for p in c.content.parts:
                        if hasattr(p, "text") and p.text:
                            raw += p.text
        if not raw:
            return None, None, "Empty response"
        data = json.loads(raw)
        wf_type = data.get("workflow_type")
        if isinstance(wf_type, str):
            wf_type = wf_type.strip() or None
        else:
            wf_type = None
        step = data.get("step")
        if not step or not isinstance(step, dict):
            return None, wf_type, None
        if not step.get("action"):
            return None, wf_type, None
        return step, wf_type, None
    except TimeoutError:
        return None, None, "Timeout"
    except json.JSONDecodeError as e:
        logger.warning("Frame JSON parse failed: %s", e)
        return None, None, str(e)
    except Exception as e:
        logger.warning("Synthesis frame %d failed: %s", frame_index, e)
        return None, None, str(e)


async def _generate_title_from_steps(
    client: Any,
    steps: list[dict],
    model: str = SYNTHESIS_MODEL,
) -> str | None:
    """Generate a short descriptive title from step summaries. Returns None on failure."""
    if not steps:
        return None
    summaries = []
    for i, s in enumerate(steps[:TITLE_MAX_STEPS_FOR_SUMMARY], 1):
        ctx = s.get("context", "")
        act = s.get("action", "")
        if ctx or act:
            summaries.append(f"{i}. {act}: {ctx[:TITLE_CONTEXT_SLICE_CHARS]}".strip(": "))
    if not summaries:
        return None
    prompt = (
        "Given these workflow steps:\n"
        + "\n".join(summaries)
        + "\n\nReturn ONLY a short title (3-6 words) describing what this workflow does. No quotes, no punctuation at end."
    )
    try:
        from google.genai import types as gtypes

        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=[gtypes.Content(role="user", parts=[gtypes.Part.from_text(text=prompt)])],
                config=gtypes.GenerateContentConfig(
                    max_output_tokens=TITLE_MAX_OUTPUT_TOKENS,
                    temperature=SYNTHESIS_FRAME_TEMPERATURE,
                ),
            ),
            timeout=TITLE_GENERATION_TIMEOUT_S,
        )
        text = ""
        if response and response.candidates:
            for c in response.candidates:
                if c.content and c.content.parts:
                    for p in c.content.parts:
                        if hasattr(p, "text") and p.text:
                            text += p.text
        title = text.strip().strip('"').strip("'") if text else ""
        return title if title else None
    except (TimeoutError, Exception) as e:
        logger.warning("Title generation failed (will use fallback): %s", e)
        return None


async def synthesize_workflow_from_media(
    client: Any,
    parts: list[Any],
    model: str = SYNTHESIS_MODEL,
) -> dict:
    """One-shot multimodal synthesis (video/images). Same semantic JSON as frames/description."""
    try:
        from google.genai import types as gtypes
    except ImportError:
        return {
            "title": "Untitled",
            "workflow_type": "browser",
            "steps": [],
            "variables": [],
        }

    user_parts = [gtypes.Part.from_text(text=MEDIA_SYNTHESIS_PROMPT), *parts]
    contents = [gtypes.Content(role="user", parts=user_parts)]
    config = gtypes.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=MEDIA_SYNTHESIS_TEMPERATURE,
    )

    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model,
        contents=contents,
        config=config,
    )

    raw = response.text if hasattr(response, "text") and response.text else ""
    if not raw and response.candidates:
        for c in response.candidates:
            if c.content and c.content.parts:
                for p in c.content.parts:
                    if hasattr(p, "text") and p.text:
                        raw += p.text
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    raw = re.sub(r"\s*```\s*$", "", raw.strip(), flags=re.MULTILINE)
    raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        m = re.search(r"\{[\s\S]*\}", raw)
        extracted = m.group(0) if m else None
        if extracted:
            try:
                data = json.loads(extracted)
            except json.JSONDecodeError:
                logger.warning(
                    "Media synthesis JSON parse failed: %s. Raw (truncated): %s",
                    e,
                    raw[:JSON_ERROR_LOG_TRUNCATE_CHARS],
                )
                return {
                    "title": "Untitled",
                    "workflow_type": "browser",
                    "steps": [],
                    "variables": [],
                }
        else:
            logger.warning(
                "Media synthesis JSON parse failed: %s. Raw (truncated): %s",
                e,
                raw[:JSON_ERROR_LOG_TRUNCATE_CHARS],
            )
            return {
                "title": "Untitled",
                "workflow_type": "browser",
                "steps": [],
                "variables": [],
            }

    if not isinstance(data, dict):
        return {
            "title": "Untitled",
            "workflow_type": "browser",
            "steps": [],
            "variables": [],
        }

    steps_raw = data.get("steps")
    if not isinstance(steps_raw, list):
        steps_raw = []
    processed, variables = _postprocess_steps(steps_raw)
    _log_typing_sequence_warnings(processed)

    return {
        "title": data.get("title") or "Untitled workflow",
        "workflow_type": data.get("workflow_type", "browser") or "browser",
        "steps": processed,
        "variables": sorted(variables),
    }


async def synthesize_workflow_from_frames(
    frames: list[bytes],
    client: Any,
    model: str = SYNTHESIS_MODEL,
) -> dict:
    """Synthesize workflow steps from frame images (debug/fallback). Same schema as media synthesis."""
    logger.info("Synthesis: %d frames received", len(frames))
    sampled = sample_frames(frames)
    if not sampled:
        sampled = [(i, f) for i, f in enumerate(frames)]
    logger.info("Synthesis: %d frames after sampling (threshold=3%% change)", len(sampled))
    steps: list[dict] = []
    history_parts: list[str] = []
    workflow_type_hint: str | None = None

    for idx, (frame_i, frame_bytes) in enumerate(sampled):
        step, wf_type, err = await synthesize_frame_step(
            client,
            frame_bytes,
            idx,
            len(sampled),
            history_text="\n".join(history_parts[-HISTORY_ROLLING_STEPS:]) if history_parts else "",
            model=model,
        )
        if err:
            logger.warning("Frame %d synthesis error: %s", frame_i, err)
            continue
        if wf_type and workflow_type_hint is None:
            workflow_type_hint = wf_type
        if not step:
            continue
        action = (step.get("action") or "").lower()
        if action in ("finished", "call_user", "calluser"):
            if action == "finished" and steps:
                break
            continue
        steps.append(step)
        ctx = (step.get("context") or "")[:HISTORY_CONTEXT_SLICE_CHARS]
        act = step.get("action", "")
        history_parts.append(f"Step {len(steps)}: {act} — {ctx}")

    processed_steps, variables = _postprocess_steps(steps)
    _log_typing_sequence_warnings(processed_steps)
    if not processed_steps:
        logger.warning(
            "Synthesis produced 0 steps from %d frames. Check logs above for parse errors or API failures.",
            len(sampled),
        )
    title = f"Synthesized workflow ({len(processed_steps)} steps)"
    if processed_steps:
        generated = await _generate_title_from_steps(client, processed_steps, model=model)
        if generated:
            title = generated

    return {
        "title": title,
        "workflow_type": workflow_type_hint or "browser",
        "steps": processed_steps,
        "variables": sorted(variables),
    }


async def synthesize_workflow_from_description(
    description: str,
    name: str,
    workflow_type: str,
    client: Any,
    model: str = SYNTHESIS_MODEL,
) -> dict:
    """
    Generate workflow steps from a natural language description (description mode).

    Returns dict with keys: title, workflow_type, steps, variables. Uses SYNTHESIS_MODEL.
    """
    try:
        from google.genai import types as gtypes
    except ImportError:
        return {"title": name, "workflow_type": workflow_type, "steps": [], "variables": []}

    prompt = FROM_DESCRIPTION_PROMPT + f"\n\nWorkflow description:\n{description}"
    contents = [gtypes.Content(role="user", parts=[gtypes.Part.from_text(text=prompt)])]
    config = gtypes.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=MEDIA_SYNTHESIS_TEMPERATURE,
    )

    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model,
        contents=contents,
        config=config,
    )

    raw = response.text if hasattr(response, "text") and response.text else ""
    if not raw and response.candidates:
        for c in response.candidates:
            if c.content and c.content.parts:
                for p in c.content.parts:
                    if hasattr(p, "text") and p.text:
                        raw += p.text
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    raw = re.sub(r"\s*```\s*$", "", raw.strip(), flags=re.MULTILINE)
    raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        m = re.search(r"\{[\s\S]*\}", raw)
        extracted = m.group(0) if m else None
        if extracted:
            try:
                data = json.loads(extracted)
            except json.JSONDecodeError:
                logger.warning(
                    "Description synthesis JSON parse failed: %s. Raw (truncated): %s",
                    e,
                    raw[:JSON_ERROR_LOG_TRUNCATE_CHARS],
                )
                return {"title": name, "workflow_type": workflow_type, "steps": [], "variables": []}
        else:
            logger.warning(
                "Description synthesis JSON parse failed: %s. Raw (truncated): %s",
                e,
                raw[:JSON_ERROR_LOG_TRUNCATE_CHARS],
            )
            return {"title": name, "workflow_type": workflow_type, "steps": [], "variables": []}

    if not isinstance(data, dict):
        return {"title": name, "workflow_type": workflow_type, "steps": [], "variables": []}
    steps_raw = data.get("steps") if isinstance(data.get("steps"), list) else []
    processed, variables = _postprocess_steps(steps_raw)
    _log_typing_sequence_warnings(processed)
    return {
        "title": data.get("title") or name,
        "workflow_type": data.get("workflow_type", workflow_type) or workflow_type,
        "steps": processed,
        "variables": sorted(variables),
    }
