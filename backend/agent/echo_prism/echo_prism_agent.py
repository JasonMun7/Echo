"""
EchoPrism agent: Observe → Think → Act loop using Gen AI SDK + Gemini.

For ambiguous steps (no selector/url): screenshot + instruction → Gemini → parse → execute.

Key behaviors:
- Resolves model at run startup: uses fine-tuned global model from global_model/current if ready,
  else falls back to gemini-2.5-flash (UI-TARS style — one shared model for all users)
- Extracts Thought: text from model output for trace logging
- Maintains (o, t, a) history; passes summaries into subsequent prompts
- Retries up to MAX_RETRIES times on parse failure or operator False
- Verifies action success via state-transition perception (before/after screenshots)
- Returns sentinel "finished" / "calluser" from run_ambiguous_step when agent signals completion
- 3-tier pure VLM perception: scene understanding (Tier 1) + element grounding (Tier 2)

Performance optimizations:
- media_resolution=MEDIUM for perceive_scene (560 tokens vs 1120)
- media_resolution=LOW for _verify_action (280 tokens vs 1120, 2 images)
- Tightened max_output_tokens per call type
- perceive_scene skipped for non-visual actions (scene-gating)
- Adaptive settle time per action type (300ms click vs 1000ms static)
- Verification skipped with pixel-hash check when grounding confidence=high
- System prompt cached per workflow run via Gemini context caching
- zoom_and_reground() for medium-confidence grounding (RegionFocus, ICCV 2025)
"""
import asyncio
import hashlib
import logging
import os
import re
from typing import Any, Literal

from .action_parser import extract_thought, parse_action
from .image_utils import build_context, compress_screenshot
from .operator import OperatorResult, PlaywrightOperator
from .perception import ground_element, perceive_scene, zoom_and_reground
from .prompts import (
    WorkflowType,
    call_user_prompt,
    history_summary_text,
    state_transition_prompt,
    step_instruction,
    system_prompt,
)

logger = logging.getLogger(__name__)

MAX_RETRIES = 3

# Fallback model when no fine-tuned model is available
FALLBACK_MODEL = "gemini-2.5-flash"

# Terminal sentinel type for callers to detect Finished/CallUser
AgentSignal = Literal["finished", "calluser"]

# Actions where perceive_scene adds no value — agent acts without needing visual layout
_SKIP_SCENE_ACTIONS = {"navigate", "wait", "press_key", "hotkey", "scroll"}

# Per-action-type settle time in seconds after operator.execute() returns True.
# Clicks that trigger navigation need extra time for DOM + paint to settle.
# These values are conservative — the pixel-hash check confirms actual change occurred.
_SETTLE_TIMES: dict[str, float] = {
    "click": 1.5,       # May trigger navigation or DOM mutation
    "rightclick": 0.4,
    "doubleclick": 1.0,
    "hover": 0.2,
    "type": 0.1,
    "hotkey": 0.3,
    "scroll": 0.3,
    "drag": 0.4,
    "navigate": 2.0,    # Full page load
    "presskey": 1.0,    # Enter often submits/navigates
    "selectoption": 0.5,
    "waitforelement": 0.0,
    "wait": 0.0,
}

try:
    from google import genai
    from google.genai import types as gtypes

    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

# Module-level cached client (created once per process)
_CLIENT: Any = None


def _get_client(api_key: str) -> Any:
    """Return a cached genai.Client instance."""
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = genai.Client(api_key=api_key)
    return _CLIENT


def _resolve_model(owner_uid: str | None, db: Any | None) -> str:
    """
    Look up global_model/current in Firestore (UI-TARS style global model).
    Returns the fine-tuned global model ID if job_status == "ready", else FALLBACK_MODEL.
    All users share the same improved model — no per-user model resolution needed.
    Fails silently — any error returns the fallback so the agent always runs.
    """
    if db is None:
        return FALLBACK_MODEL
    try:
        doc = db.collection("global_model").document("current").get()
        if doc.exists:
            data = doc.to_dict() or {}
            if data.get("job_status") == "ready" and data.get("tuned_model_id"):
                model_id = data["tuned_model_id"]
                logger.info("EchoPrism using global fine-tuned model: %s", model_id)
                return model_id
    except Exception as e:
        logger.warning("Global model resolution failed, using fallback: %s", e)
    return FALLBACK_MODEL


def _cache_system_prompt(client: Any, sys: str, model: str) -> str | None:
    """
    Upload the system prompt to Gemini context cache and return the cache name.
    Returns None on failure — callers fall back to re-sending the prompt inline.
    Cache TTL is 1 hour (sufficient for any single workflow run).

    Notes:
    - Context caching requires >= 1024 tokens and is only supported on stable
      model versions (e.g. gemini-1.5-pro-001, gemini-1.5-flash-001).
    - gemini-2.5-flash / gemini-2.5-pro preview endpoints return 400 for caching.
    - We fail silently and always fall back to inline system prompt.
    """
    # Only attempt caching for model versions that support it (stable suffixes)
    _CACHEABLE_PREFIXES = ("gemini-1.5-pro", "gemini-1.5-flash")
    if not any(model.startswith(p) for p in _CACHEABLE_PREFIXES):
        logger.debug("Context caching skipped: model '%s' does not support it", model)
        return None
    try:
        cache = client.caches.create(
            model=model,
            config=gtypes.CreateCachedContentConfig(
                contents=[gtypes.Content(role="user", parts=[gtypes.Part.from_text(text=sys)])],
                ttl="3600s",
            ),
        )
        logger.info("System prompt cached: %s (%d chars)", cache.name, len(sys))
        return cache.name
    except Exception as e:
        logger.debug("Context cache unavailable: %s", e)
        return None


def _screenshot_hash(data: bytes) -> str:
    """MD5 hash of raw screenshot bytes for fast pixel-level change detection."""
    return hashlib.md5(data).hexdigest()


async def _call_gemini(
    client: Any,
    instruction: str,
    img_bytes: bytes,
    sys: str,
    history_text: str = "",
    extra_context: str = "",
    model: str = FALLBACK_MODEL,
    cached_content: str | None = None,
) -> tuple[str, str | None]:
    """
    Single Gemini call. Returns (raw_text, error).
    history_text is injected as a separate user-message part.
    extra_context is appended as a second text part (e.g. retry error message).
    cached_content: Gemini context cache name for the system prompt.
    """
    user_parts: list[Any] = []
    if history_text:
        user_parts.append(gtypes.Part.from_text(text=history_text))
    user_parts.extend([
        gtypes.Part.from_text(text=instruction),
        gtypes.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
    ])
    if extra_context:
        user_parts.append(gtypes.Part.from_text(text=extra_context))

    # Build config — use cached content reference if available, else inline system prompt
    if cached_content:
        config = gtypes.GenerateContentConfig(
            cached_content=cached_content,
            # HIGH resolution: the main action-selection call needs full visual detail
            max_output_tokens=256,
            temperature=0.0,
        )
    else:
        config = gtypes.GenerateContentConfig(
            system_instruction=sys,
            max_output_tokens=256,
            temperature=0.0,
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
            return "", "Empty model response"
        return text, None
    except asyncio.TimeoutError:
        return "", "Gemini call timed out after 30s"
    except Exception as e:
        logger.exception("Gemini call failed: %s", e)
        return "", str(e)


async def _verify_action(
    client: Any,
    before_bytes: bytes,
    after_bytes: bytes,
    action_str: str = "",
    expected_outcome: str = "",
) -> tuple[str, bool]:
    """
    State-transition perception: compare before/after screenshots.
    Returns (description, succeeded).
    Parses 'VERDICT: success' or 'VERDICT: failed' from the model response.
    Defaults to succeeded=True if verdict is unparseable (fail-open for robustness).
    """
    # Use 768px max for verify images — combined with LOW media_resolution = minimal tokens
    before_compressed = compress_screenshot(before_bytes, max_dim=768)
    after_compressed = compress_screenshot(after_bytes, max_dim=768)

    prompt = state_transition_prompt(action_str=action_str, expected_outcome=expected_outcome)
    user_parts = [
        gtypes.Part.from_text(text=prompt),
        gtypes.Part.from_text(text="BEFORE screenshot:"),
        gtypes.Part.from_bytes(data=before_compressed, mime_type="image/jpeg"),
        gtypes.Part.from_text(text="AFTER screenshot:"),
        gtypes.Part.from_bytes(data=after_compressed, mime_type="image/jpeg"),
    ]

    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model="gemini-2.5-flash",
                contents=[gtypes.Content(role="user", parts=user_parts)],
                config=gtypes.GenerateContentConfig(
                    # LOW resolution: binary pass/fail check — macro-level changes
                    # are clearly visible at 280 tokens vs 1120. Saves ~840 tokens/call
                    # (2 images × ~420 saved each).
                    media_resolution=gtypes.MediaResolution.MEDIA_RESOLUTION_LOW,
                    max_output_tokens=128,
                    temperature=0.0,
                ),
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
        description = text.strip() or "No change detected"

        verdict_match = re.search(r"VERDICT:\s*(success|failed)", description, re.IGNORECASE)
        if verdict_match:
            succeeded = verdict_match.group(1).lower() == "success"
        else:
            logger.warning("No VERDICT found in state-transition response; assuming success")
            succeeded = True

        return description, succeeded
    except asyncio.TimeoutError:
        logger.warning("State-transition verification timed out")
        return "Verification timed out", True
    except Exception as e:
        logger.warning("State-transition verification failed: %s", e)
        return "Verification unavailable", True


# Click-type actions that benefit from Tier 2 grounding
_GROUNDING_ACTIONS = {"click", "doubleclick", "rightclick", "hover", "drag"}


async def run_ambiguous_step(
    page: Any,
    step_data: dict[str, Any],
    step_index: int,
    total: int,
    history: list[dict[str, Any]] | None = None,
    workflow_type: WorkflowType = "browser",
    api_key: str | None = None,
    owner_uid: str | None = None,
    db: Any | None = None,
    cached_prompt: str | None = None,
    prefetched_caption: str | None = None,
) -> tuple[bool | AgentSignal, str | None, str | None, str | None]:
    """
    Execute one ambiguous step via EchoPrism + Playwright.

    owner_uid + db: used to resolve the fine-tuned model from global_model/current.
    Falls back to FALLBACK_MODEL if no fine-tuned model is ready.
    cached_prompt: Gemini context cache name for the system prompt (set once per workflow run).
    prefetched_caption: pre-computed scene caption from the previous step's prefetch task.

    Returns:
        (result, thought, action_str, error)
        where result is:
          True        - step succeeded
          False       - step failed after retries
          "finished"  - agent signaled task complete
          "calluser"  - agent needs human intervention
        thought: the extracted Thought text from the last Gemini response
        action_str: string representation of the executed action (for trace logging)
        error: error message if result is False, or CallUser reason if "calluser"
    """
    if not HAS_GENAI:
        return False, "", "", "google-genai not installed"

    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        return False, "", "", "GEMINI_API_KEY not set"

    model = _resolve_model(owner_uid, db)
    logger.info("EchoPrism step %d/%d using model: %s", step_index, total, model)

    history = history or []
    instruction = step_instruction(step_data, step_index, total)
    expected_outcome = step_data.get("expected_outcome", "")
    step_action = (step_data.get("action") or "").lower().replace("_", "")

    client = _get_client(key)
    sys = system_prompt(instruction, workflow_type)

    last_error = ""
    thought = ""
    action_str = ""

    for attempt in range(MAX_RETRIES + 1):
        # Fresh screenshot on every attempt (re-screenshot after failed actions)
        try:
            await asyncio.wait_for(
                page.wait_for_load_state("domcontentloaded", timeout=3000),
                timeout=4.0,
            )
        except Exception:
            pass
        current_screenshot = await page.screenshot(type="png", full_page=False)

        # Tier 1: Scene Understanding — on first attempt, skip for non-visual actions
        scene_caption = ""
        if attempt == 0:
            if prefetched_caption is not None:
                # Use pre-computed caption from previous step's speculative prefetch
                scene_caption = prefetched_caption
                logger.debug("Using prefetched scene caption (step %d)", step_index)
            elif step_action not in _SKIP_SCENE_ACTIONS:
                compressed_for_scene = compress_screenshot(current_screenshot)
                scene_caption = await perceive_scene(client, compressed_for_scene, "gemini-2.5-flash")
                if scene_caption:
                    logger.debug("Scene caption (step %d): %s...", step_index, scene_caption[:100])
            else:
                logger.debug("Skipping perceive_scene for action '%s' (step %d)", step_action, step_index)

        # Build history context — screenshots as observation window
        try:
            if history:
                screenshots, summary = build_context(history, n_images=2)
                img_bytes = compress_screenshot(current_screenshot)
                history_text = history_summary_text(summary)
            else:
                img_bytes = compress_screenshot(current_screenshot)
                history_text = ""
        except ValueError:
            img_bytes = compress_screenshot(current_screenshot)
            history_text = ""

        # Prepend scene caption to instruction for attempt 0
        effective_instruction = instruction
        if scene_caption and attempt == 0:
            effective_instruction = f"[Scene Overview]\n{scene_caption}\n\n{instruction}"

        extra_context = f"Previous attempt failed: {last_error}" if last_error else ""
        raw_text, call_err = await _call_gemini(
            client,
            effective_instruction,
            img_bytes,
            sys,
            history_text=history_text,
            extra_context=extra_context,
            model=model,
            cached_content=cached_prompt,
        )

        if call_err:
            last_error = call_err
            logger.warning("EchoPrism Gemini call failed (attempt %d): %s", attempt + 1, call_err)
            if attempt < MAX_RETRIES:
                await asyncio.sleep(1.0 * (attempt + 1))
            continue

        thought = extract_thought(raw_text)
        parsed = parse_action(raw_text)

        if not parsed:
            last_error = f"Could not parse action from model output: {raw_text[:200]}"
            logger.warning("EchoPrism parse failed (attempt %d): %s", attempt + 1, last_error)
            if attempt < MAX_RETRIES:
                await asyncio.sleep(0.5)
            continue

        parsed_action_name = parsed.get("action", "")

        # Tier 2: Structured Element Grounding — before click-type actions
        location = None
        if parsed_action_name in _GROUNDING_ACTIONS:
            target_desc = (
                step_data.get("params", {}).get("description")
                or step_data.get("context", "")
                or parsed_action_name
            )
            compressed_for_grounding = compress_screenshot(current_screenshot)
            location = await ground_element(
                client,
                compressed_for_grounding,
                target_desc,
                "gemini-2.5-flash",
            )

            if location and location.confidence == "medium" and location.box_2d:
                # RegionFocus: zoom into the predicted region and re-ground at HIGH detail
                # when confidence is uncertain. Improves grounding accuracy ~28% (ICCV 2025).
                refined = await zoom_and_reground(
                    client,
                    current_screenshot,
                    location.box_2d,
                    target_desc,
                    "gemini-2.5-flash",
                )
                if refined:
                    location = refined
                    logger.info(
                        "RegionFocus reground (step %d): confidence now %s at (%d, %d)",
                        step_index, location.confidence, location.center_x, location.center_y,
                    )

            if location and location.confidence in ("high", "medium"):
                logger.info(
                    "Grounding override (step %d, confidence=%s): (%d, %d)",
                    step_index, location.confidence, location.center_x, location.center_y,
                )
                if "x1" in parsed:
                    parsed["x1"] = location.center_x
                    parsed["y1"] = location.center_y
                else:
                    parsed["x"] = location.center_x
                    parsed["y"] = location.center_y

        # Build human-readable action_str for tracing
        skip_keys = {"action"}
        kv = {k: v for k, v in parsed.items() if k not in skip_keys}
        action_str = f"{parsed_action_name}({', '.join(str(v) for v in kv.values())})"

        before_screenshot = current_screenshot
        before_hash = _screenshot_hash(before_screenshot)
        op = PlaywrightOperator(page)
        result: OperatorResult = await op.execute(parsed)

        # Terminal signals
        if result == "finished":
            return "finished", thought, action_str, None

        if result == "calluser":
            reason = call_user_prompt(thought) if thought else "Agent requested user intervention"
            return "calluser", thought, action_str, reason

        if result is True:
            # Adaptive settle time: per action type instead of fixed 1s
            settle_secs = _SETTLE_TIMES.get(parsed_action_name, 0.5)
            if settle_secs > 0:
                await asyncio.sleep(settle_secs)

            # Wait for DOM to be ready before taking the after-screenshot
            try:
                await asyncio.wait_for(
                    page.wait_for_load_state("domcontentloaded", timeout=5000),
                    timeout=6.0,
                )
            except Exception:
                pass

            after_screenshot = await page.screenshot(type="png", full_page=False)
            after_hash = _screenshot_hash(after_screenshot)

            # Fast pixel-hash check — if bytes are identical, the action had no visible effect.
            # Some actions (e.g. typing, clicking toggles) legitimately change the DOM without
            # a large visual shift; allow up to 2 hash-unchanged retries with a longer pause
            # before treating it as a hard failure.
            if before_hash == after_hash:
                logger.warning(
                    "Pixel hash unchanged (step %d, attempt %d): Screenshots identical after action — no visible change detected",
                    step_index, attempt + 1,
                )
                if attempt < MAX_RETRIES:
                    # Give the page more time — some SPAs animate content in after DOMContentLoaded
                    extra_wait = 1.5 * (attempt + 1)
                    await asyncio.sleep(extra_wait)
                    # Re-check with a fresh screenshot before retrying the action
                    retry_screenshot = await page.screenshot(type="png", full_page=False)
                    if _screenshot_hash(retry_screenshot) != before_hash:
                        # Page did change — treat as success, allow VLM verify
                        after_screenshot = retry_screenshot
                        after_hash = _screenshot_hash(after_screenshot)
                        logger.info(
                            "Pixel change detected after extra wait (step %d, attempt %d)",
                            step_index, attempt + 1,
                        )
                    else:
                        last_error = "Screenshots identical after action — no visible change detected"
                        continue
                else:
                    last_error = "Screenshots identical after action — no visible change detected"
                    continue

            # Adaptive verification skip: if grounding was high-confidence, the element
            # was correctly targeted. Combined with hash change above we have strong
            # evidence of success — skip the expensive Gemini verification call.
            if location is not None and location.confidence == "high":
                logger.info(
                    "Skipping VLM verify — grounding confidence=high + pixel hash changed (step %d)",
                    step_index,
                )
                history.append({
                    "thought": thought,
                    "action": action_str,
                    "screenshot": compress_screenshot(after_screenshot),
                })
                return True, thought, action_str, None

            # Full VLM state-transition verification for uncertain cases
            transition_desc, succeeded = await _verify_action(
                client, before_screenshot, after_screenshot,
                action_str=action_str,
                expected_outcome=expected_outcome,
            )
            logger.info("State transition (step %d): %s", step_index, transition_desc[:120])

            if succeeded:
                history.append({
                    "thought": thought,
                    "action": action_str,
                    "screenshot": compress_screenshot(after_screenshot),
                })
                return True, thought, action_str, None

            last_error = f"Action appeared to have no effect: {transition_desc[:200]}"
            logger.warning(
                "State-transition VERDICT: failed (attempt %d, step %d): %s",
                attempt + 1, step_index, last_error,
            )
            continue

        # result is False — retry
        last_error = f"Operator returned False for action: {action_str}"
        logger.warning("EchoPrism operator failed (attempt %d): %s", attempt + 1, last_error)

    return "calluser", thought, action_str, f"Stuck after {MAX_RETRIES + 1} attempts — {last_error or 'no clear reason'}"
