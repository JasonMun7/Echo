"""
EchoPrism Synthesis Agent — synthesize workflow from video/screenshots using EchoPrism-style grounding.

Instead of raw Gemini, runs an observe→think→act loop over frames with:
- Frame sampling (pHash/pixel-diff): only process frames with >5% change (~80% token savings)
- Visual Anchoring Thought: "I see the 'Search' input to the right of the logo at [0.452, 0.120]"
- Virtual operator: accepts actions, advances frame, records (frame, thought, action, coords)
- Output: workflow JSON with 3-decimal normalized coords [0.000, 1.000]
"""
import asyncio
import hashlib
import logging
import re
from typing import Any

from echo_prism.alpha.action_parser import extract_thought, parse_action
from echo_prism.alpha.image_utils import compress_screenshot
from echo_prism.models_config import SYNTHESIS_MODEL

logger = logging.getLogger(__name__)

SYNTHESIS_SYSTEM_PROMPT = """You are EchoPrism in SYNTHESIS mode. You observe screenshot frames from a user's screen recording and output the next UI action the user is performing.

## Output format (strict)
Thought: <Visual Anchoring — describe the target element's relative position. Example: "I see the 'Search' input to the right of the logo and above the 'Trending' list at [0.452, 0.120]">
Action: <action>(<params>)

## Visual Anchoring (required)
Every Thought MUST include normalized coordinates [x, y] where x,y are in [0.000, 1.000] (0=left/top, 1=right/bottom).
Example: "I see the blue 'Submit' button in the center-bottom of the form at [0.502, 0.880]"

## Action space
- Click(x, y) — x,y in 0-1000 scale (convert from 0-1: multiply by 1000)
- Type(content)
- Scroll(x, y, direction, distance)
- PressKey(key)
- Navigate(url)
- SelectOption(x, y, value)
- Hover(x, y)
- DoubleClick(x, y)
- RightClick(x, y)
- Wait(seconds)
- Finished() — no more actions in this frame sequence
- CallUser(reason) — cannot determine the action

## Rules
- Output ONLY Thought line then Action line. No markdown, no extra text.
- Use 3-decimal precision for coordinates in the Thought (e.g. [0.452, 0.120]).
- Use 0-1000 integer scale for Action params (e.g. Click(452, 120) for center of screen).
"""


def _frame_hash(data: bytes) -> str:
    """MD5 hash for fast change detection."""
    return hashlib.md5(data).hexdigest()


def _pixel_diff_ratio(prev: bytes, curr: bytes) -> float:
    """Rough estimate of pixel-level change ratio. Returns value in [0, 1] — higher = more change."""
    if not prev or not curr:
        return 1.0
    if len(prev) != len(curr):
        return 0.5
    diff = sum(1 for a, b in zip(prev[:10000], curr[:10000]) if a != b)
    return diff / min(10000, len(prev))


def should_process_frame(prev_hash: str | None, curr_hash: str, prev_bytes: bytes | None, curr_bytes: bytes) -> bool:
    """Frame sampling: only process if >5% change from previous."""
    if prev_hash is None:
        return True
    if prev_hash == curr_hash:
        return False
    if prev_bytes and curr_bytes:
        ratio = _pixel_diff_ratio(prev_bytes, curr_bytes)
        return ratio > 0.05
    return True


def sample_frames(
    frames: list[bytes],
    change_threshold: float = 0.05,
) -> list[tuple[int, bytes]]:
    """Filter frames to only those with >change_threshold visual change."""
    if not frames:
        return []
    result: list[tuple[int, bytes]] = []
    prev_hash: str | None = None
    prev_bytes: bytes | None = None
    for i, f in enumerate(frames):
        h = _frame_hash(f)
        if should_process_frame(prev_hash, h, prev_bytes, f):
            result.append((i, f))
            prev_hash = h
            prev_bytes = f
    return result


async def synthesize_frame(
    client: Any,
    frame_bytes: bytes,
    frame_index: int,
    total_frames: int,
    history_text: str = "",
    model: str = SYNTHESIS_MODEL,
    cached_content: str | None = None,
) -> tuple[str, str | None, str | None]:
    """Single frame synthesis. Returns (thought, action_str, error).

    When cached_content is provided (explicit cache from synthesize_workflow_from_frames),
    the system prompt is served from cache — avoids re-sending ~500 tokens per frame.
    """
    try:
        from google.genai import types as gtypes
    except ImportError:
        return "", "", "google-genai not available"

    instruction = (
        f"Frame {frame_index + 1}/{total_frames}. "
        "What UI action is the user performing in this screenshot? "
        "Output Thought (with visual anchoring coords) and Action."
    )
    compressed = compress_screenshot(frame_bytes, max_dim=1024)
    user_parts = []
    if history_text:
        user_parts.append(gtypes.Part.from_text(text=f"Prior steps:\n{history_text}"))
    user_parts.extend([
        gtypes.Part.from_text(text=instruction),
        gtypes.Part.from_bytes(data=compressed, mime_type="image/jpeg"),
    ])

    if cached_content:
        config = gtypes.GenerateContentConfig(
            cached_content=cached_content,
            max_output_tokens=256,
            temperature=0.2,
        )
    else:
        config = gtypes.GenerateContentConfig(
            system_instruction=SYNTHESIS_SYSTEM_PROMPT,
            max_output_tokens=256,
            temperature=0.2,
        )

    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=[gtypes.Content(role="user", parts=user_parts)],
                config=config,
            ),
            timeout=30.0,
        )
        text = ""
        if response and response.candidates:
            for c in response.candidates:
                if c.content and c.content.parts:
                    for p in c.content.parts:
                        if hasattr(p, "text") and p.text:
                            text += p.text
        if not text:
            return "", "", "Empty response"
        thought = extract_thought(text)
        parsed = parse_action(text)
        action_str = ""
        if parsed:
            action_str = _format_action_for_workflow(parsed)
        return thought, action_str, None
    except asyncio.TimeoutError:
        return "", "", "Timeout"
    except Exception as e:
        logger.warning("Synthesis frame %d failed: %s", frame_index, e)
        return "", "", str(e)


def _format_action_for_workflow(parsed: dict) -> str:
    """Format parsed action for workflow step params."""
    action = parsed.get("action", "")
    if action == "click":
        x, y = parsed.get("x", 500), parsed.get("y", 500)
        return f"Click({x},{y})"
    if action == "type":
        return f"Type({parsed.get('content', '')})"
    if action == "scroll":
        x, y = parsed.get("x", 500), parsed.get("y", 500)
        d = parsed.get("direction", "down")
        dist = parsed.get("distance", 300)
        return f"Scroll({x},{y},{d},{dist})"
    if action == "presskey":
        return f"PressKey({parsed.get('key', 'enter')})"
    if action == "navigate":
        return f"Navigate({parsed.get('url', '')})"
    if action == "selectoption":
        x, y = parsed.get("x", 500), parsed.get("y", 500)
        v = parsed.get("value", "")
        return f"SelectOption({x},{y},{v})"
    if action == "hover":
        x, y = parsed.get("x", 500), parsed.get("y", 500)
        return f"Hover({x},{y})"
    if action == "doubleclick":
        x, y = parsed.get("x", 500), parsed.get("y", 500)
        return f"DoubleClick({x},{y})"
    if action == "rightclick":
        x, y = parsed.get("x", 500), parsed.get("y", 500)
        return f"RightClick({x},{y})"
    if action == "wait":
        return f"Wait({parsed.get('seconds', 2)})"
    if action == "finished":
        return "Finished()"
    if action == "calluser":
        return f"CallUser({parsed.get('reason', '')})"
    return str(parsed)


def _parsed_to_workflow_step(parsed: dict, thought: str, step_index: int) -> dict:
    """Convert parsed action + thought to workflow step format."""
    action = parsed.get("action", "wait")
    params: dict[str, Any] = {}
    context = thought
    expected_outcome = "Action completed"

    if action == "click":
        params = {
            "x": min(1000, max(0, int(parsed.get("x", 500)))),
            "y": min(1000, max(0, int(parsed.get("y", 500)))),
            "description": thought or "Click the element",
        }
        expected_outcome = "Element clicked"
    elif action == "navigate":
        params = {"url": parsed.get("url", ""), "description": "Navigate"}
        expected_outcome = "Page loads"
    elif action == "type_text_at" or action == "type":
        params = {
            "x": parsed.get("x", 500),
            "y": parsed.get("y", 500),
            "text": parsed.get("content", "{{input}}"),
            "description": thought or "Input field",
        }
        expected_outcome = "Text entered"
    elif action == "scroll":
        params = {
            "x": parsed.get("x", 500),
            "y": parsed.get("y", 500),
            "direction": parsed.get("direction", "down"),
            "distance": parsed.get("distance", 300),
        }
        expected_outcome = "Content scrolled"
    elif action == "press_key" or action == "presskey":
        params = {"key": parsed.get("key", "Enter"), "description": thought or "Press key"}
    elif action == "select_option" or action == "selectoption":
        params = {
            "x": parsed.get("x", 500),
            "y": parsed.get("y", 500),
            "value": parsed.get("value", ""),
            "description": thought or "Dropdown",
        }
    elif action == "hover":
        params = {
            "x": parsed.get("x", 500),
            "y": parsed.get("y", 500),
            "description": thought or "Element",
        }
    elif action == "wait":
        params = {"seconds": parsed.get("seconds", 2)}
    elif action == "finished":
        return {"_signal": "finished"}
    elif action == "calluser":
        return {"_signal": "calluser", "reason": parsed.get("reason", "")}

    action_map = {
        "click": "click_at",
        "type": "type_text_at",
        "doubleclick": "double_click",
        "rightclick": "right_click",
        "presskey": "press_key",
        "selectoption": "select_option",
        "navigate": "navigate",
        "scroll": "scroll",
        "wait": "wait",
    }
    wf_action = action_map.get(action, action)
    return {
        "action": wf_action,
        "params": params,
        "context": context,
        "expected_outcome": expected_outcome,
    }


def _create_synthesis_cache(client: Any, model: str) -> str | None:
    """Create explicit context cache for synthesis system prompt. Returns cache name or None on failure."""
    _CACHEABLE_PREFIXES = ("gemini-1.5-pro", "gemini-1.5-flash", "gemini-3-flash", "gemini-3.1-pro")
    if not any(model.startswith(p) for p in _CACHEABLE_PREFIXES):
        return None
    try:
        from google.genai import types as gtypes

        cache = client.caches.create(
            model=model,
            config=gtypes.CreateCachedContentConfig(
                system_instruction=SYNTHESIS_SYSTEM_PROMPT,
                ttl="3600s",
            ),
        )
        logger.info("Synthesis cache created: %s (%d chars)", cache.name, len(SYNTHESIS_SYSTEM_PROMPT))
        return cache.name
    except Exception as e:
        logger.debug("Synthesis cache unavailable, using inline system prompt: %s", e)
        return None


async def synthesize_workflow_from_frames(
    frames: list[bytes],
    client: Any,
    model: str = SYNTHESIS_MODEL,
) -> dict:
    """Synthesize workflow steps from a list of frame images. Returns dict with keys: title, workflow_type, steps.

    Uses explicit context cache for the system prompt when supported — avoids re-sending ~500 tokens
    per frame (Gemini 3 Flash has 1,024 token limit; caching yields large savings).
    """
    sampled = sample_frames(frames)
    if not sampled:
        sampled = [(i, f) for i, f in enumerate(frames)]
    steps: list[dict] = []
    history_parts: list[str] = []

    cached_content = _create_synthesis_cache(client, model)
    try:
        for idx, (frame_i, frame_bytes) in enumerate(sampled):
            thought, action_str, err = await synthesize_frame(
                client,
                frame_bytes,
                idx,
                len(sampled),
                history_text="\n".join(history_parts[-5:]) if history_parts else "",
                model=model,
                cached_content=cached_content,
            )
            if err:
                logger.warning("Frame %d synthesis error: %s", frame_i, err)
                continue
            parsed = parse_action(f"Action: {action_str}")
            if not parsed:
                continue
            step = _parsed_to_workflow_step(parsed, thought, len(steps) + 1)
            if step.get("_signal") == "finished":
                break
            if step.get("_signal") == "calluser":
                continue
            steps.append(step)
            history_parts.append(f"Step {len(steps)}: {thought} -> {action_str}")

        return {
            "title": f"Synthesized workflow ({len(steps)} steps)",
            "workflow_type": "browser",
            "steps": steps,
        }
    finally:
        if cached_content:
            try:
                client.caches.delete(name=cached_content)
                logger.debug("Synthesis cache evicted: %s", cached_content[:50])
            except Exception as e:
                logger.debug("Synthesis cache eviction skipped: %s", e)
