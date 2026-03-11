"""
EchoPrism Synthesis Agent — single subagent for all workflow synthesis.

Supports three modes:
1. Media (video/screenshots) → one-shot multimodal → workflow JSON (used by /api/synthesize)
2. Video frames → observe→think→act per frame → workflow JSON
3. Natural language description → workflow steps (JSON)

Uses SYNTHESIS_MODEL (gemini-2.5-pro for media/description, gemini-2.5-flash for frame-by-frame).
"""
import asyncio
import hashlib
import json
import logging
import os
import re
from typing import Any

from echo_prism.alpha.action_parser import extract_thought, parse_action
from echo_prism.alpha.image_utils import compress_screenshot
from echo_prism.models_config import SYNTHESIS_MODEL
from echo_prism.utils.omniparser_client import parse_screenshot as omniparser_parse, OmniParserResult

logger = logging.getLogger(__name__)

SYNTHESIS_SYSTEM_PROMPT = """You are EchoPrism in SYNTHESIS mode. You observe screenshot frames from a user's screen recording and output the next UI action the user is performing.

## Output format (strict)
Output exactly two lines. DO NOT wrap in markdown code blocks (no ```). No preamble, no extra text.
Line 1: Thought: <visual anchoring with coords>
Line 2: Action: <action>(<params>)

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

## Examples
Thought: I see the search input in the top navigation bar at [0.452, 0.065].
Action: Click(452, 65)

Thought: User is typing in the focused field at [0.502, 0.420].
Action: Type("search query")

Thought: No further UI changes; workflow appears complete.
Action: Finished()

## Rules
- Output ONLY the Thought line then the Action line. No markdown, no code fences, no extra text.
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


def should_process_frame(prev_hash: str | None, curr_hash: str, prev_bytes: bytes | None, curr_bytes: bytes, change_threshold: float = 0.03) -> bool:
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
    change_threshold: float = 0.03,
) -> list[tuple[int, bytes]]:
    """Filter frames to only those with >change_threshold visual change."""
    if not frames:
        return []
    result: list[tuple[int, bytes]] = []


def _snap_to_nearest_element(
    x: int, y: int, omniparser_result: OmniParserResult | None, snap_radius: int = 60,
) -> tuple[int, int, str]:
    """Snap (x, y) to the center of the nearest OmniParser-detected element bbox.

    Returns (snapped_x, snapped_y, element_label). If no element is within snap_radius
    or no OmniParser result, returns original coords with empty label.
    Coordinates are in 0-1000 normalized space.
    """
    if not omniparser_result or not omniparser_result.parsed_content_list:
        return x, y, ""

    best_dist = float("inf")
    best_cx, best_cy = x, y
    best_label = ""

    for elem in omniparser_result.parsed_content_list:
        bbox = elem.get("bbox")
        if not bbox or len(bbox) != 4:
            continue
        x_min, y_min, x_max, y_max = [float(v) for v in bbox]
        cx = int((x_min + x_max) / 2 * 1000)
        cy = int((y_min + y_max) / 2 * 1000)
        dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
        if dist < best_dist:
            best_dist = dist
            best_cx, best_cy = cx, cy
            best_label = elem.get("content", "")

    if best_dist <= snap_radius:
        return best_cx, best_cy, best_label
    return x, y, ""


async def _get_omniparser_for_frame(frame_bytes: bytes) -> OmniParserResult | None:
    """Call OmniParser for a synthesis frame if configured."""
    url = os.environ.get("ECHOPRISM_OMNIPARSER_URL", "") or os.environ.get("OMNIPARSER_URL", "")
    if not url:
        return None
    try:
        return await omniparser_parse(frame_bytes, url, timeout=20.0, use_cache=True)
    except Exception as e:
        logger.debug("OmniParser unavailable for synthesis frame: %s", e)
        return None
    prev_hash: str | None = None
    prev_bytes: bytes | None = None
    for i, f in enumerate(frames):
        h = _frame_hash(f)
        if should_process_frame(prev_hash, h, prev_bytes, f, change_threshold):
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
    omniparser_result: OmniParserResult | None = None,
) -> tuple[str, str | None, str | None]:
    """Single frame synthesis. Returns (thought, action_str, error).

    When omniparser_result is provided, detected elements are injected as
    additional context and action coordinates are snapped to the nearest element.
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

    # Inject OmniParser-detected elements for grounding
    if omniparser_result and omniparser_result.screen_info:
        instruction += (
            f"\n\n[Detected UI Elements]\n{omniparser_result.screen_info}\n"
            "Use element positions to ground your coordinates precisely."
        )

    compressed = compress_screenshot(frame_bytes, max_dim=1024)
    user_parts = []
    if history_text:
        user_parts.append(gtypes.Part.from_text(text=f"Prior steps:\n{history_text}"))
    user_parts.extend([
        gtypes.Part.from_text(text=instruction),
        gtypes.Part.from_bytes(data=compressed, mime_type="image/jpeg"),
    ])

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
            # Snap coordinates to nearest OmniParser element for precision
            if omniparser_result and "x" in parsed and "y" in parsed:
                orig_x, orig_y = int(parsed["x"]), int(parsed["y"])
                snapped_x, snapped_y, label = _snap_to_nearest_element(
                    orig_x, orig_y, omniparser_result
                )
                if (snapped_x, snapped_y) != (orig_x, orig_y):
                    logger.debug(
                        "Synthesis snap: (%d,%d) -> (%d,%d) [%s]",
                        orig_x, orig_y, snapped_x, snapped_y, label[:40],
                    )
                    parsed["x"] = snapped_x
                    parsed["y"] = snapped_y
            action_str = _format_action_for_workflow(parsed)
        else:
            logger.warning("Synthesis parse_action failed. Raw model output (first 400 chars): %s", text[:400] if text else "(empty)")
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


async def _generate_title_from_steps(
    client: Any,
    steps: list[dict],
    model: str = SYNTHESIS_MODEL,
) -> str | None:
    """Generate a short descriptive title from step summaries. Returns None on failure."""
    if not steps:
        return None
    summaries = []
    for i, s in enumerate(steps[:10], 1):
        ctx = s.get("context", "")
        act = s.get("action", "")
        if ctx or act:
            summaries.append(f"{i}. {act}: {ctx[:80]}".strip(": "))
    if not summaries:
        return None
    prompt = (
        "Given these workflow steps:\n"
        + "\n".join(summaries)
        + '\n\nReturn ONLY a short title (3-6 words) describing what this workflow does. No quotes, no punctuation at end.'
    )
    try:
        from google.genai import types as gtypes

        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=[gtypes.Content(role="user", parts=[gtypes.Part.from_text(text=prompt)])],
                config=gtypes.GenerateContentConfig(
                    max_output_tokens=32,
                    temperature=0.2,
                ),
            ),
            timeout=10.0,
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
    except (asyncio.TimeoutError, Exception) as e:
        logger.warning("Title generation failed (will use fallback): %s", e)
        return None


async def synthesize_workflow_from_frames(
    frames: list[bytes],
    client: Any,
    model: str = SYNTHESIS_MODEL,
) -> dict:
    """Synthesize workflow steps from a list of frame images. Returns dict with keys: title, workflow_type, steps.

    No context caching; each run is fresh to ensure actions match the current recording.
    """
    logger.info("Synthesis: %d frames received", len(frames))
    sampled = sample_frames(frames)
    if not sampled:
        sampled = [(i, f) for i, f in enumerate(frames)]
    logger.info("Synthesis: %d frames after sampling (threshold=3%% change)", len(sampled))
    steps: list[dict] = []
    history_parts: list[str] = []

    for idx, (frame_i, frame_bytes) in enumerate(sampled):
        # Get OmniParser elements for this frame (best-effort, non-blocking on failure)
        omni_result = await _get_omniparser_for_frame(frame_bytes)

        thought, action_str, err = await synthesize_frame(
            client,
            frame_bytes,
            idx,
            len(sampled),
            history_text="\n".join(history_parts[-5:]) if history_parts else "",
            model=model,
            omniparser_result=omni_result,
        )
        if err:
            logger.warning("Frame %d synthesis error: %s", frame_i, err)
            continue
        parsed = parse_action(f"Action: {action_str}")
        if not parsed:
            logger.warning("Frame %d: parse_action failed for action_str=%r", frame_i, action_str)
            continue
        step = _parsed_to_workflow_step(parsed, thought, len(steps) + 1)
        if step.get("_signal") == "finished":
            if steps:
                break
            continue
        if step.get("_signal") == "calluser":
            continue
        steps.append(step)
        history_parts.append(f"Step {len(steps)}: {thought} -> {action_str}")

    if not steps:
        logger.warning("Synthesis produced 0 steps from %d frames. Check logs above for parse errors or API failures.", len(sampled))
    title = f"Synthesized workflow ({len(steps)} steps)"
    if steps:
        generated = await _generate_title_from_steps(client, steps, model=model)
        if generated:
            title = generated

    return {
        "title": title,
        "workflow_type": "browser",
        "steps": steps,
    }


# --- Media (video/images) one-shot mode ---

MEDIA_SYNTHESIS_PROMPT = """You are an expert workflow extraction system designed to produce training data for a pure Vision-Language Model (VLM) UI agent called EchoPrism. EchoPrism NEVER reads the DOM — it relies entirely on visual descriptions and normalized pixel coordinates to locate and interact with UI elements. Your output must be precise enough that EchoPrism can re-locate every element purely from screenshots.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 0 — RECOGNIZE INTEGRATION OPPORTUNITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before extracting steps, scan all frames for the following known applications:
- Slack (slack.com, app.slack.com) → use action "api_call" with integration "slack"
- Gmail (mail.google.com) → use action "api_call" with integration "gmail"
- Google Sheets (docs.google.com/spreadsheets) → use action "api_call" with integration "google_sheets"
- Google Calendar (calendar.google.com) → use action "api_call" with integration "google_calendar"
- Notion (notion.so) → use action "api_call" with integration "notion"
- GitHub (github.com) → use action "api_call" with integration "github"
- Linear (linear.app) → use action "api_call" with integration "linear"

When you see the user performing a simple action in one of these apps (sending a message, creating an issue, writing to a spreadsheet), prefer generating a single "api_call" step with the appropriate method and inferred args over multiple click/type steps.

For api_call steps: action="api_call", params={"integration": "slack", "method": "send_message", "args": {"channel": "#general", "text": "..."}}
Only fall back to click_at steps for these apps if the action is too complex or ambiguous to represent as an api_call.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — CLASSIFY WORKFLOW TYPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before extracting steps, determine the workflow type:
- "browser": Activity is primarily inside a web browser (Chrome, Safari, Firefox, Edge). Steps involve navigating URLs, clicking web elements, filling forms, selecting dropdowns.
- "desktop": Activity involves native OS applications (Finder, terminal, desktop apps, system menus). Steps involve opening apps, hotkeys, right-clicking, double-clicking native UI.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — STUDY EVERY FRAME BEFORE WRITING COORDINATES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For each interactive action (click_at, type_text_at, select_option, hover, right_click, double_click, drag):
a. Identify the target element across MULTIPLE frames to confirm its position is stable.
b. Measure the element's center in raw pixels: (pixel_x, pixel_y).
c. Convert to normalized 0-1000 scale:
   x = round(pixel_x / screen_width * 1000)
   y = round(pixel_y / screen_height * 1000)
d. Clamp x and y to [0, 1000].
e. NEVER use exactly 500/500 as a guess — only if the element is genuinely in the exact center.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — WRITE MAXIMALLY SPECIFIC DESCRIPTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every "description" field must enable EchoPrism to re-locate the element from a screenshot alone. Include ALL of:
- Element type (button, link, text input, dropdown, checkbox, icon, tab, menu item, toggle, avatar, badge, close button, radio button, slider, etc.)
- Visible label text (exact, in single quotes) OR a clear visual descriptor if there is no text
- Color or visual style if distinctive (blue, green, outlined, filled, icon-only)
- Screen region (top-left, top-center, top-right, bottom-left, bottom-center, bottom-right, center, left sidebar, right panel, header, footer, modal, etc.)
- Any parent container or section that helps disambiguate (e.g. "inside the 'Billing' card", "in the navigation bar", "in the search results row")

Examples of GOOD descriptions:
- "blue 'Sign In' button in the bottom-center of the login modal"
- "white 'Email' text input field with placeholder 'you@example.com' in the top-center of the login form"
- "grey 'Country' dropdown labeled 'Select country' in the middle of the 'Shipping Address' section"
- "red trash-can icon button in the top-right corner of the 'Item 2' card"
- "left-sidebar 'Dashboard' menu item with a house icon, highlighted with a blue background"

Examples of BAD descriptions (do NOT produce these):
- "the button" — too vague
- "input field" — no location or label
- "Submit" — missing element type and region
- "#submit-btn" — CSS selector, FORBIDDEN

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "title": "<5-8 word descriptive title summarising what the workflow accomplishes>",
  "workflow_type": "browser" | "desktop",
  "steps": [
    {
      "action": "<action_type>",
      "context": "<WHY this step is needed — purpose in the overall flow, not just what it does>",
      "params": { ... action-specific params ... },
      "expected_outcome": "<what is VISUALLY DIFFERENT on screen AFTER this action succeeds>"
    }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BROWSER ACTIONS (use only when workflow_type is "browser")
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- navigate:
  { "url": "https://...", "description": "Navigate to the target URL" }
  expected_outcome: "Page loads and URL bar shows <url>"

- click_at:
  { "x": <int 0-1000>, "y": <int 0-1000>, "description": "<maximally specific description>" }
  expected_outcome: "<visible change: modal opens, page navigates, button highlights, etc.>"

- type_text_at:
  { "x": <int 0-1000>, "y": <int 0-1000>, "text": "{{variable_name}}", "description": "<maximally specific description of the input field>" }
  expected_outcome: "Text '{{variable_name}}' appears in the field"

- scroll:
  { "x": <int 0-1000>, "y": <int 0-1000>, "direction": "down" | "up", "distance": <pixels> }
  expected_outcome: "Page content scrolls <direction> revealing more content"

- wait_for_element:
  { "description": "<what to wait for — describe the element that must become visible or disappear>" }
  expected_outcome: "<element description> becomes visible / loading indicator disappears"
  USE THIS whenever waiting for a page load, navigation, API response, or content to appear. Do NOT use "wait" for these cases.

- select_option:
  { "x": <int 0-1000>, "y": <int 0-1000>, "value": "<option_value>", "description": "<maximally specific description of the dropdown>" }
  expected_outcome: "Dropdown shows '<option_value>' as selected"

- hover:
  { "x": <int 0-1000>, "y": <int 0-1000>, "description": "<element> that reveals a submenu or tooltip on hover" }
  expected_outcome: "Submenu or tooltip becomes visible"

- press_key:
  { "key": "Enter" | "Tab" | "Escape" | "ArrowDown" | etc., "description": "<why pressing this key>" }
  expected_outcome: "<visible result: form submits, dialog closes, focus moves, etc.>"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESKTOP ACTIONS (use only when workflow_type is "desktop")
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- click_at:
  { "x": <int 0-1000>, "y": <int 0-1000>, "description": "<maximally specific description>" }
  expected_outcome: "<visible change>"

- right_click:
  { "x": <int 0-1000>, "y": <int 0-1000>, "description": "<maximally specific description>" }
  expected_outcome: "Context menu appears with options"

- double_click:
  { "x": <int 0-1000>, "y": <int 0-1000>, "description": "<maximally specific description>" }
  expected_outcome: "<file opens / app launches / item is renamed>"

- type_text_at:
  { "x": <int 0-1000>, "y": <int 0-1000>, "text": "{{variable_name}}", "description": "<maximally specific description of the input field>" }
  expected_outcome: "Text '{{variable_name}}' appears in the field"

- hotkey:
  { "keys": ["cmd", "c"], "description": "<what this hotkey accomplishes>" }
  expected_outcome: "<visible result>"

- press_key:
  { "key": "enter" | "escape" | "tab" | etc., "description": "<why pressing this key>" }
  expected_outcome: "<visible result>"

- scroll:
  { "x": <int 0-1000>, "y": <int 0-1000>, "direction": "down" | "up", "distance": <pixels> }
  expected_outcome: "Content scrolls <direction>"

- drag:
  { "x": <int 0-1000>, "y": <int 0-1000>, "x2": <int 0-1000>, "y2": <int 0-1000>, "description": "Drag <source description> to <destination description>" }
  expected_outcome: "<item moved / window resized>"

- wait:
  { "seconds": <int> }
  expected_outcome: "Application completes its operation after the wait"

- open_app:
  { "appName": "<AppName>", "description": "Launch <AppName> to begin the workflow" }
  expected_outcome: "<AppName> window opens and is in focus"

- focus_app:
  { "appName": "<AppName>", "description": "Bring <AppName> to the foreground" }
  expected_outcome: "<AppName> window becomes the active window"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY RULES — VIOLATIONS WILL BREAK THE AGENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. COORDINATES: Study multiple frames. Use real pixel positions converted to 0-1000 scale. Never fabricate or guess with 500/500.
2. DESCRIPTION: Every action with a target element MUST have a maximally specific "description" (see Step 3 above). This is the ONLY way EchoPrism can find the element.
3. EXPECTED_OUTCOME: Every step MUST include "expected_outcome" at the top level, describing the VISUAL change on screen.
4. CONTEXT: Each "context" must explain WHY the step is needed, not just what it does. Include the workflow goal this step serves.
5. NO SELECTORS: STRICTLY FORBIDDEN — do NOT output CSS selectors, XPath, DOM IDs, class names, or any HTML/DOM reference. This is a pure vision system.
6. NO RISK FIELD: Do not include a "risk" field.
7. VARIABLES: Use {{variable_name}} for any user-provided input (email, password, search terms, filenames). Use descriptive snake_case variable names (e.g. {{recipient_email}}, {{search_query}}).
8. WAIT_FOR_ELEMENT over WAIT: For any page load, navigation, content appearing, or API response — use wait_for_element. Only use wait for fixed-duration pauses (animations, system dialogs).
9. INSERT WAIT_FOR_ELEMENT AFTER: navigate, click_at that triggers navigation/modal/content load, press_key that submits a form, or any step that causes a visible page transition.
10. DEDUPLICATION: Skip consecutive identical (action + params) steps.
11. OUTPUT: ONLY valid JSON, no markdown fences, no extra text."""


def _postprocess_steps(steps_data: list[dict]) -> tuple[list[dict], set[str]]:
    """Clamp coords, deduplicate, extract variables. Returns (processed_steps, variables)."""
    variables: set[str] = set()
    processed_steps: list[dict] = []
    prev_key: tuple | None = None
    for s in steps_data:
        params = dict(s.get("params", {}))
        for coord_key in ("x", "y", "x2", "y2"):
            if coord_key in params:
                try:
                    params[coord_key] = max(0, min(1000, int(float(params[coord_key]))))
                except (TypeError, ValueError):
                    params[coord_key] = 500
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


async def synthesize_workflow_from_media(
    client: Any,
    parts: list[Any],
    model: str = SYNTHESIS_MODEL,
) -> dict:
    """
    One-shot synthesis from video or images. Caller uploads media to Gemini and passes
    ready-to-use Part objects. Returns dict with title, workflow_type, steps, variables.
    """
    try:
        from google.genai import types as gtypes
    except ImportError:
        return {"title": "", "workflow_type": "browser", "steps": [], "variables": []}

    contents = [
        gtypes.Content(
            role="user",
            parts=[gtypes.Part.from_text(text=MEDIA_SYNTHESIS_PROMPT)] + list(parts),
        )
    ]
    config = gtypes.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=0.2,
    )
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model,
        contents=contents,
        config=config,
    )
    raw = response.text if response and response.text else ""
    if not raw and response and response.candidates:
        for c in response.candidates:
            if c.content and c.content.parts:
                for p in c.content.parts:
                    if hasattr(p, "text") and p.text:
                        raw += p.text
    if not raw:
        raise ValueError("Empty response from Gemini")
    data = json.loads(raw)
    steps_data = data.get("steps", [])
    processed_steps, variables = _postprocess_steps(steps_data)
    workflow_type = data.get("workflow_type", "browser")
    if workflow_type not in ("browser", "desktop"):
        workflow_type = "browser"
    return {
        "title": data.get("title", ""),
        "workflow_type": workflow_type,
        "steps": processed_steps,
        "variables": sorted(variables),
    }


# --- Description-to-workflow mode ---

FROM_DESCRIPTION_PROMPT = """You are an expert workflow synthesis system for EchoPrism, a pure Vision-Language Model UI automation agent.

Given a natural language description of a workflow, produce a structured list of steps.

STEP 0 — INTEGRATION RECOGNITION:
If the description mentions any of these apps, prefer api_call steps over click sequences:
- Slack → action "api_call", integration "slack"
- Gmail / email → action "api_call", integration "gmail"
- Google Sheets / spreadsheet → action "api_call", integration "google_sheets"
- Google Calendar → action "api_call", integration "google_calendar"
- Notion → action "api_call", integration "notion"
- GitHub → action "api_call", integration "github"
- Linear → action "api_call", integration "linear"

For UI actions (navigate, click, type, scroll, etc.), provide:
- action: one of navigate | click_at | type_text_at | scroll | wait | press_key | select_option | hover
- params: url (for navigate), description (for click_at/type_text_at), text (for type_text_at), direction+distance (for scroll), key (for press_key), value+description (for select_option)
- context: what the user is trying to accomplish at this step
- expected_outcome: what should be visible after this action succeeds

For api_call actions, provide:
- action: "api_call"
- params: { integration, method, args: {} }  (args are best-guess based on description)
- context: what API operation this represents

Output ONLY valid JSON — no markdown, no code fences. Format:
{
  "title": "short workflow title",
  "workflow_type": "browser" or "desktop",
  "steps": [
    {
      "action": "...",
      "context": "...",
      "params": {},
      "expected_outcome": "..."
    }
  ]
}"""


async def synthesize_workflow_from_description(
    description: str,
    name: str,
    workflow_type: str,
    client: Any,
    model: str = SYNTHESIS_MODEL,
) -> dict:
    """
    Generate workflow steps from a natural language description (description mode).

    Returns dict with keys: title, workflow_type, steps. Uses SYNTHESIS_MODEL.
    """
    try:
        from google.genai import types as gtypes
    except ImportError:
        return {"title": name, "workflow_type": workflow_type, "steps": []}

    prompt = FROM_DESCRIPTION_PROMPT + f"\n\nWorkflow description:\n{description}"
    contents = [
        gtypes.Content(role="user", parts=[gtypes.Part.from_text(text=prompt)])
    ]
    config = gtypes.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=0.2,
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
                logger.warning("Description synthesis JSON parse failed: %s. Raw (truncated): %s", e, raw[:500])
                return {"title": name, "workflow_type": workflow_type, "steps": []}
        else:
            logger.warning("Description synthesis JSON parse failed: %s. Raw (truncated): %s", e, raw[:500])
            return {"title": name, "workflow_type": workflow_type, "steps": []}

    if not isinstance(data, dict):
        return {"title": name, "workflow_type": workflow_type, "steps": []}
    return {
        "title": data.get("title") or name,
        "workflow_type": data.get("workflow_type", workflow_type) or workflow_type,
        "steps": data.get("steps") if isinstance(data.get("steps"), list) else [],
    }
