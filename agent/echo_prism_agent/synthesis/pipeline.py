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
import uuid
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


# Mirrors apps/web step-editor-panel: narrative lives in params.description for these actions.
_COMPOSER_DESCRIPTION_ACTIONS = frozenset(
    {
        "wait_for_element",
        "click_at",
        "type_text_at",
        "hover",
        "right_click",
        "double_click",
        "drag_drop",
        "drag",
        "select_option",
    }
)

# Normalized action names (lower, no underscores) for post-router keyframe spreading.
VISUAL_KEYFRAME_ACTIONS = frozenset(a.lower().replace("_", "") for a in _COMPOSER_DESCRIPTION_ACTIONS) | frozenset(
    {"scroll"}
)

_KEYFRAME_PNG_LEAF = re.compile(r"^image_(\d+)\.png$", re.I)


def _max_attachment_c_index(attachments: list[dict]) -> int:
    m = 0
    for a in attachments:
        rl = str(a.get("ref_label") or "").strip()
        mm = re.fullmatch(r"c(\d+)", rl, re.I)
        if mm:
            m = max(m, int(mm.group(1)))
    return m


def _ref_token_present(text: str, ref: str) -> bool:
    rid = ref.strip().lower().lstrip("@")
    if re.search(r"\{\{" + re.escape(rid) + r"\}\}", text, re.I):
        return True
    return bool(re.search(r"(?:^|\s)@" + re.escape(rid) + r"(?:\s|$|[.,;:!?)])", text, re.I))


def _append_ref_token_to_text(text: str, ref: str) -> str:
    if _ref_token_present(text, ref):
        return text
    tok = f"{{{{{ref}}}}}"
    t = text.rstrip()
    if not t:
        return f"{tok} "
    return f"{t} {tok} "


def link_frame_url_to_context_attachments(step: dict) -> dict:
    """Promote frame_image_url into context_attachments + {{cN}} tokens; drop frame/overlay (rich context only)."""
    fiu = str(step.get("frame_image_url") or "").strip()
    if not fiu:
        return step
    s = dict(step)
    params = dict(s.get("params") or {})
    context = str(s.get("context") or "")
    action = str(s.get("action") or "")

    raw_att = s.get("context_attachments")
    attachments: list[dict] = []
    if isinstance(raw_att, list):
        for item in raw_att:
            if isinstance(item, dict) and str(item.get("url") or "").strip():
                attachments.append(dict(item))

    ref: str | None = None
    for a in attachments:
        if str(a.get("url") or "").strip() == fiu:
            rl = str(a.get("ref_label") or "").strip()
            if re.fullmatch(r"c\d+", rl, re.I):
                ref = rl.lower()
            else:
                n = _max_attachment_c_index(attachments) + 1
                ref = f"c{n}"
                a["ref_label"] = ref
            break

    if ref is None:
        n = _max_attachment_c_index(attachments) + 1
        ref = f"c{n}"
        attachments.append(
            {
                "id": str(uuid.uuid4()),
                "kind": "image",
                "name": "Step capture",
                "url": fiu,
                "ref_label": ref,
            }
        )

    context = _append_ref_token_to_text(context, ref)
    if action in _COMPOSER_DESCRIPTION_ACTIONS:
        desc = str(params.get("description") or "")
        params["description"] = _append_ref_token_to_text(desc, ref)

    s["context"] = context
    s["params"] = params
    s["context_attachments"] = attachments
    s.pop("frame_image_url", None)
    s.pop("click_overlay", None)
    return s


def _norm_action_key(step: dict) -> str:
    return (str(step.get("action") or "")).lower().replace("_", "")


def _keyframe_index_from_url(url: str) -> int | None:
    leaf = (url.split("?")[0] or "").strip().rstrip("/").split("/")[-1]
    m = _KEYFRAME_PNG_LEAF.match(leaf)
    return int(m.group(1)) if m else None


def _replace_url_keyframe_index(url: str, new_k: int) -> str:
    u = url.strip()
    if not u:
        return u
    q = u.split("?", 1)[1] if "?" in u else ""
    base = u.split("?")[0]
    parent, _, leaf = base.rpartition("/")
    if not _KEYFRAME_PNG_LEAF.match(leaf):
        return u
    new_leaf = f"image_{new_k}.png"
    prefix = f"{parent}/" if parent else ""
    return prefix + new_leaf + (f"?{q}" if q else "")


def _first_keyframe_image_attachment(step: dict) -> dict | None:
    raw = step.get("context_attachments")
    if not isinstance(raw, list):
        return None
    for item in raw:
        if not isinstance(item, dict):
            continue
        kind = item.get("kind")
        if isinstance(kind, str) and kind.strip().lower() not in ("", "image"):
            continue
        for key in ("url", "gcs_blob"):
            raw_u = item.get(key)
            if isinstance(raw_u, str) and _keyframe_index_from_url(raw_u) is not None:
                return item
    return None


def spread_collapsed_synthesis_keyframes(steps: list[dict], *, hi: int) -> None:
    """
    After keyframe URLs are clamped to 0..hi, spread distinct ``image_k.png`` across visual steps
    when the model collapsed every step onto one still; backfill missing stills for visual actions.

    Mutates ``steps`` in place. Skips when ``hi < 1`` (only one keyframe). When the model already
    used multiple distinct keyframe indices on visual steps, existing attachments are kept; only
    steps missing a keyframe still are backfilled.
    """
    if hi < 1 or not steps:
        return

    visual_indices: list[int] = []
    for i, s in enumerate(steps):
        if not isinstance(s, dict):
            continue
        if _norm_action_key(s) not in VISUAL_KEYFRAME_ACTIONS:
            continue
        visual_indices.append(i)

    if not visual_indices:
        return

    n = len(visual_indices)
    k_assign = [round(p * hi / max(n - 1, 1)) for p in range(n)]

    k_per_step: dict[int, int | None] = {}
    for si in visual_indices:
        att = _first_keyframe_image_attachment(steps[si])
        if att is None:
            k_per_step[si] = None
            continue
        u = ""
        for key in ("url", "gcs_blob"):
            v = att.get(key)
            if isinstance(v, str) and v.strip():
                u = v.strip()
                break
        k_per_step[si] = _keyframe_index_from_url(u)

    present = [k for k in k_per_step.values() if k is not None]
    unique_present = set(present)
    collapsed = len(present) >= 2 and len(unique_present) == 1

    for pos, si in enumerate(visual_indices):
        step = steps[si]
        if not isinstance(step, dict):
            continue
        target_k = k_assign[pos]
        cur_k = k_per_step.get(si)

        if cur_k is not None:
            if collapsed:
                att = _first_keyframe_image_attachment(step)
                if att:
                    for key in ("url", "gcs_blob"):
                        raw_u = att.get(key)
                        if isinstance(raw_u, str) and _keyframe_index_from_url(raw_u) is not None:
                            att[key] = _replace_url_keyframe_index(raw_u, target_k)
            # model_diverse or a single step with a still: keep existing attachment URLs
            continue

        step["frame_image_url"] = f"image_{target_k}.png"
        steps[si] = link_frame_url_to_context_attachments(step)


def _postprocess_steps(steps_data: list[dict]) -> tuple[list[dict], set[str]]:
    """
    Strip legacy coordinate keys, deduplicate, extract {{variables}}. No bogus coord defaults.

    Planned (not implemented here): **action-aware attachment pruning** — after model output,
    drop or merge `context_attachments` on steps where images are unlikely to help (e.g. pure
    `navigate` / `api_call`), keep at most one extra still on `scroll` end-states, and cap
    duplicates per ref_label. Pair with `link_frame_url_to_context_attachments` + optional
    vision pass to pick the best `image_k` index per step from extracted keyframes.
    """
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
                    if re.fullmatch(r"c\d+", m, re.I):
                        continue
                    variables.add(m)
        step_key = (s.get("action", ""), json.dumps(params, sort_keys=True))
        if step_key == prev_key:
            continue
        prev_key = step_key
        s_copy = dict(s)
        s_copy["params"] = params
        processed_steps.append(s_copy)
    linked = [link_frame_url_to_context_attachments(st) for st in processed_steps]
    return linked, variables


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
    *,
    storage_prefix: str | None = None,
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

    if storage_prefix:
        prefix_note = (
            f"STORAGE: Uploaded assets use GCS prefix `{storage_prefix}/`. "
            "You may reference them in `frame_image_url` or `context_attachments[].url` as relative filenames "
            "(e.g. `image_0.png`) inside that prefix, or as full `gs://…` / `https://` URLs."
        )
        user_parts = [
            gtypes.Part.from_text(text=prefix_note),
            gtypes.Part.from_text(text=MEDIA_SYNTHESIS_PROMPT),
            *parts,
        ]
    else:
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
