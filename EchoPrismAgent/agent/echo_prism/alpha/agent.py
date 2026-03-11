"""
EchoPrism agent: Observe → Think → Act loop using Gen AI SDK + Gemini.

For ambiguous steps (no selector/url): screenshot + instruction → Gemini → parse → execute.

Key behaviors:
- Resolves model at run startup: uses fine-tuned global model from global_model/current if ready,
  else falls back to gemini-3.1-pro-preview (UI-TARS style — one shared model for all users)
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
import base64
import hashlib
import logging
import os
import re
from typing import Any, Literal

from echo_prism.models_config import GROUNDING_MODEL, ORCHESTRATION_MODEL
from echo_prism.subagents.runner_agent import resolve_coords_for_action

from .action_parser import extract_thought, parse_action, set_omniparser_element_count
from .image_utils import build_context, compress_screenshot, compress_screenshot_for_verify
from echo_prism.subagents.runner import OperatorResult, PlaywrightOperator
from .perception import perceive_scene
from .prompts import (
    WorkflowType,
    call_user_prompt,
    detected_elements_context,
    history_summary_text,
    state_transition_prompt,
    step_instruction,
    system_prompt,
)

logger = logging.getLogger(__name__)

MAX_RETRIES = 3

# Fallback orchestration model when no fine-tuned model is available
FALLBACK_MODEL = ORCHESTRATION_MODEL

# Terminal sentinel type for callers to detect Finished/CallUser
AgentSignal = Literal["finished", "calluser"]

# Actions where perceive_scene adds no value — agent acts without needing visual layout
_SKIP_SCENE_ACTIONS = {"navigate", "wait", "press_key", "hotkey", "scroll"}

# Per-action-type settle time in seconds after operator.execute() returns True.
_SETTLE_TIMES: dict[str, float] = {
    "click": 1.5,  # May trigger navigation or DOM mutation
    "rightclick": 0.4,
    "doubleclick": 1.0,
    "hover": 0.2,
    "type": 0.1,
    "hotkey": 0.3,
    "scroll": 0.3,
    "drag": 0.4,
    "navigate": 2.0,  # Full page load
    "presskey": 1.0,  # Enter often submits/navigates
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

# OmniParser client (lazy import to avoid hard failure if httpx not installed)
try:
    from echo_prism.utils.omniparser_client import (
        OmniParserResult,
        parse_screenshot as omniparser_parse,
    )
    from echo_prism.models_config import OMNIPARSER_URL

    HAS_OMNIPARSER = bool(OMNIPARSER_URL)
except ImportError:
    HAS_OMNIPARSER = False
    OMNIPARSER_URL = ""
    OmniParserResult = None  # type: ignore
    omniparser_parse = None  # type: ignore


def _get_client(api_key: str) -> Any:
    """Return a cached genai.Client instance."""
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = genai.Client(api_key=api_key)
    return _CLIENT


def _resolve_model(owner_uid: str | None, db: Any | None) -> str:
    """Look up global_model/current in Firestore (UI-TARS style global model)."""
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
    """Upload the system prompt to Gemini context cache and return the cache name."""
    _CACHEABLE_PREFIXES = ("gemini-1.5-pro", "gemini-1.5-flash", "gemini-3.1-pro")
    if not any(model.startswith(p) for p in _CACHEABLE_PREFIXES):
        logger.debug("Context caching skipped: model '%s' does not support it", model)
        return None
    try:
        cache = client.caches.create(
            model=model,
            config=gtypes.CreateCachedContentConfig(
                contents=[
                    gtypes.Content(role="user", parts=[gtypes.Part.from_text(text=sys)])
                ],
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


def _build_retry_context(last_error: str) -> str:
    """Build extra context for VLM when retrying after a failed attempt."""
    if not last_error:
        return ""
    ctx = f"Previous attempt failed: {last_error}"
    lower_err = last_error.lower()
    if "identical" in lower_err or "no visible change" in lower_err or "no effect" in lower_err or "no change" in lower_err or "did not change" in lower_err or "not yet" in lower_err or "did not appear" in lower_err or "did not load" in lower_err:
        ctx += (
            "\n\nIMPORTANT RETRY GUIDANCE: Your previous action had NO visible effect. "
            "Try a DIFFERENT approach — in order of priority:\n"
            "1. PressKey(\"enter\") — if the target item is already selected/highlighted in a list, "
            "pressing Enter is the MOST RELIABLE way to open it (especially in IDEs like IntelliJ, VS Code, etc.)\n"
            "2. DoubleClick instead of Click — many apps (IntelliJ, Finder, etc.) require double-click to open items/projects\n"
            "3. If the step requires typing into a field, use ClickAndType(element_id, \"text\") to click AND type in one action\n"
            "4. IMPORTANT: If you are trying to open/select a list item and clicking by element_id keeps failing, "
            "the element you picked may be a text field or search bar — NOT the list item. "
            "Look for a different element further DOWN the screen (higher y-coordinate), or try Click(x, y) "
            "with coordinates BELOW the search bar area.\n"
            "5. Right-click → Open or a keyboard shortcut as alternative\n"
            "Do NOT repeat the exact same action — try a genuinely different element or approach."
        )
    return ctx


async def _call_gemini(
    client: Any,
    instruction: str,
    img_bytes: bytes,
    sys: str,
    history_text: str = "",
    extra_context: str = "",
    model: str = FALLBACK_MODEL,
    cached_content: str | None = None,
    temperature: float = 0.0,
) -> tuple[str, str | None]:
    """Single Gemini call. Returns (raw_text, error)."""
    user_parts: list[Any] = []
    if history_text:
        user_parts.append(gtypes.Part.from_text(text=history_text))
    user_parts.extend(
        [
            gtypes.Part.from_text(text=instruction),
            gtypes.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
        ]
    )
    if extra_context:
        user_parts.append(gtypes.Part.from_text(text=extra_context))

    if cached_content:
        config = gtypes.GenerateContentConfig(
            cached_content=cached_content,
            max_output_tokens=2048,
            temperature=temperature,
            automatic_function_calling=gtypes.AutomaticFunctionCallingConfig(disable=True),
            thinking_config=gtypes.ThinkingConfig(thinking_budget=1024),
        )
    else:
        config = gtypes.GenerateContentConfig(
            system_instruction=sys,
            max_output_tokens=2048,
            temperature=temperature,
            automatic_function_calling=gtypes.AutomaticFunctionCallingConfig(disable=True),
            thinking_config=gtypes.ThinkingConfig(thinking_budget=1024),
        )

    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=[gtypes.Content(role="user", parts=user_parts)],
                config=config,
            ),
            timeout=60.0,
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
    """State-transition perception: compare before/after screenshots."""
    before_compressed = compress_screenshot_for_verify(before_bytes)
    after_compressed = compress_screenshot_for_verify(after_bytes)

    prompt = state_transition_prompt(
        action_str=action_str, expected_outcome=expected_outcome
    )
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
                    media_resolution=gtypes.MediaResolution.MEDIA_RESOLUTION_LOW,
                    max_output_tokens=2048,
                    temperature=0.0,
                    automatic_function_calling=gtypes.AutomaticFunctionCallingConfig(disable=True),
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
        logger.info("State-transition verify response: %s", description[:500])

        # Try strict format first: "VERDICT: success" / "VERDICT: failed"
        verdict_match = re.search(
            r"VERDICT:\s*(success|failed)", description, re.IGNORECASE
        )
        if not verdict_match:
            # Fallback: "VERDICT" followed by success/failed without colon
            verdict_match = re.search(
                r"VERDICT\s*:?\s*(success|failed)", description, re.IGNORECASE
            )
        if not verdict_match:
            # Last resort: check if description ends with or contains
            # clear success/fail indicators (model may have been truncated)
            lower = description.lower()
            if "identical" in lower or "no change" in lower or "did not change" in lower:
                logger.info("Inferred VERDICT: failed (no change detected in description)")
                return description, False
        if verdict_match:
            succeeded = verdict_match.group(1).lower() == "success"
        else:
            logger.warning(
                "No VERDICT found in state-transition response; assuming success"
            )
            succeeded = True

        return description, succeeded
    except asyncio.TimeoutError:
        logger.warning("State-transition verification timed out")
        return "Verification timed out", True
    except Exception as e:
        logger.warning("State-transition verification failed: %s", e)
        return "Verification unavailable", True


_GROUNDING_ACTIONS = {"click", "doubleclick", "rightclick", "hover", "drag"}
_SYSTEM2_N = 8
_SYSTEM2_MIN_AGREE = 6
_SYSTEM2_PX_TOLERANCE = 5


def _coord_match(a: dict, b: dict) -> bool:
    """Check if two parsed actions have coords within 5px (0-1000 scale)."""
    xa, ya = a.get("x", a.get("x1", 500)), a.get("y", a.get("y1", 500))
    xb, yb = b.get("x", b.get("x1", 500)), b.get("y", b.get("y1", 500))
    return (
        abs(xa - xb) <= _SYSTEM2_PX_TOLERANCE and abs(ya - yb) <= _SYSTEM2_PX_TOLERANCE
    )


async def _call_gemini_n_samples(
    client: Any,
    instruction: str,
    img_bytes: bytes,
    sys: str,
    history_text: str,
    model: str,
    cached_content: str | None,
    n: int = _SYSTEM2_N,
) -> tuple[list[tuple[str, dict | None]], str | None]:
    """Run N sampled Gemini calls with temperature for diversity."""
    tasks = [
        _call_gemini(
            client,
            instruction,
            img_bytes,
            sys,
            history_text=history_text,
            extra_context="",
            model=model,
            cached_content=cached_content,
            temperature=0.4,
        )
        for _ in range(n)
    ]
    results = await asyncio.gather(*tasks)
    out: list[tuple[str, dict | None]] = []
    for raw_text, err in results:
        if err:
            continue
        thought = extract_thought(raw_text or "")
        parsed = parse_action(raw_text or "")
        out.append((thought, parsed))
    return out, None


def _system2_consensus(
    samples: list[tuple[str, dict | None]],
) -> tuple[str, dict] | None:
    """Find consensus: 6/8 agree within 5px."""
    valid = [(t, p) for t, p in samples if p is not None]
    if len(valid) < _SYSTEM2_MIN_AGREE:
        return None
    for thought, parsed in valid:
        count = sum(1 for _, p in valid if p and _coord_match(parsed, p))
        if count >= _SYSTEM2_MIN_AGREE:
            return thought, parsed
    return None


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

    Returns:
        (result, thought, action_str, error)
        where result: True | False | "finished" | "calluser"
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
        try:
            await asyncio.wait_for(
                page.wait_for_load_state("domcontentloaded", timeout=3000),
                timeout=4.0,
            )
        except Exception:
            pass
        current_screenshot = await page.screenshot(type="png", full_page=False)

        # OmniParser: detect UI elements once per attempt
        omniparser_result = None
        screen_info = ""
        if HAS_OMNIPARSER and omniparser_parse is not None:
            try:
                omniparser_result = await omniparser_parse(
                    current_screenshot, OMNIPARSER_URL
                )
                if omniparser_result:
                    screen_info = omniparser_result.screen_info
                    set_omniparser_element_count(
                        len(omniparser_result.parsed_content_list)
                    )
                    logger.debug(
                        "OmniParser detected %d elements (step %d, attempt %d)",
                        len(omniparser_result.parsed_content_list),
                        step_index,
                        attempt + 1,
                    )
                else:
                    set_omniparser_element_count(0)
            except Exception as e:
                logger.warning(
                    "OmniParser call failed (step %d, attempt %d): %s",
                    step_index,
                    attempt + 1,
                    e,
                )
                set_omniparser_element_count(0)
        else:
            set_omniparser_element_count(0)

        scene_caption = ""
        # Skip perceive_scene when OmniParser already provides element context
        if attempt == 0 and not screen_info:
            if prefetched_caption is not None:
                scene_caption = prefetched_caption
                logger.debug("Using prefetched scene caption (step %d)", step_index)
            elif step_action not in _SKIP_SCENE_ACTIONS:
                compressed_for_scene = compress_screenshot(current_screenshot)
                scene_caption = await perceive_scene(
                    client, compressed_for_scene, GROUNDING_MODEL
                )
                if scene_caption:
                    logger.debug(
                        "Scene caption (step %d): %s...",
                        step_index,
                        scene_caption[:100],
                    )
            else:
                logger.debug(
                    "Skipping perceive_scene for action '%s' (step %d)",
                    step_action,
                    step_index,
                )

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

        # When OmniParser provides a SOM-annotated image (numbered bounding boxes
        # overlaid on the screenshot), use it for the Gemini Think phase so the
        # model can visually correlate element IDs with on-screen positions.
        # Raw screenshots are still used for _verify_action state-transition comparison.
        if omniparser_result and omniparser_result.som_image_base64:
            try:
                img_bytes = base64.b64decode(omniparser_result.som_image_base64)
                logger.debug(
                    "Using SOM annotated image for Gemini Think phase (step %d, attempt %d)",
                    step_index,
                    attempt + 1,
                )
            except Exception as e:
                logger.warning(
                    "Failed to decode SOM image, using raw screenshot: %s", e
                )

        effective_instruction = instruction
        # Inject scene caption and detected elements into prompt context
        context_parts = []
        if scene_caption and attempt == 0:
            context_parts.append(f"[Scene Overview]\n{scene_caption}")
        elem_count = len(omniparser_result.parsed_content_list) if omniparser_result else 0
        elements_ctx = detected_elements_context(screen_info, element_count=elem_count)
        if elements_ctx:
            context_parts.append(elements_ctx)
        if context_parts:
            effective_instruction = "\n\n".join(context_parts) + "\n\n" + instruction

        extra_context = _build_retry_context(last_error)
        use_system2 = os.environ.get("ECHO_SYSTEM2_SAMPLING", "").lower() in (
            "1",
            "true",
            "yes",
        )

        if (
            use_system2
            and step_action
            in ("click", "clickat", "doubleclick", "rightclick", "hover", "drag")
            and attempt == 0
        ):
            samples, samp_err = await _call_gemini_n_samples(
                client,
                effective_instruction,
                img_bytes,
                sys,
                history_text=history_text,
                model=model,
                cached_content=cached_prompt,
            )
            consensus = _system2_consensus(samples) if not samp_err else None
            if consensus:
                thought, parsed = consensus
            elif samples:
                voice_fallback = os.environ.get(
                    "ECHO_SYSTEM2_VOICE_FALLBACK", ""
                ).lower() in ("1", "true", "yes")
                if voice_fallback:
                    return (
                        "calluser",
                        "I'm seeing a few different buttons here.",
                        "",
                        "I'm seeing a few different buttons here - which one did you mean?",
                    )
                thought, parsed = samples[0][0], samples[0][1]
                if parsed is None:
                    last_error = "System-2: no parseable consensus"
                    continue
                logger.info("System-2: no 6/8 consensus, using first sample")
            else:
                last_error = samp_err or "System-2: no valid samples"
                continue
        else:
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
                logger.warning(
                    "EchoPrism Gemini call failed (attempt %d): %s",
                    attempt + 1,
                    call_err,
                )
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(1.0 * (attempt + 1))
                continue

            thought = extract_thought(raw_text)
            parsed = parse_action(raw_text)
            logger.info(
                "VLM raw output (step %d, attempt %d): %s",
                step_index, attempt + 1, (raw_text or "")[:300],
            )

        if not parsed:
            last_error = f"Could not parse action from model output: {raw_text[:200]}"
            logger.warning(
                "EchoPrism parse failed (attempt %d): %s", attempt + 1, last_error
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(0.5)
            continue

        parsed_action_name = parsed.get("action", "")

        # Runner owns Locator: Alpha outputs semantic action, Runner resolves coords
        parsed, location = await resolve_coords_for_action(
            parsed,
            current_screenshot,
            client,
            step_data,
            omniparser_result=omniparser_result,
        )
        if location and location.confidence in ("high", "medium"):
            logger.info(
                "Locator override (step %d, confidence=%s): (%d, %d)",
                step_index,
                location.confidence,
                location.center_x,
                location.center_y,
            )

        skip_keys = {"action"}
        kv = {k: v for k, v in parsed.items() if k not in skip_keys}
        action_str = f"{parsed_action_name}({', '.join(str(v) for v in kv.values())})"

        before_screenshot = current_screenshot
        before_hash = _screenshot_hash(before_screenshot)
        op = PlaywrightOperator(page)
        result: OperatorResult = await op.execute(parsed)

        if result == "finished":
            return "finished", thought, action_str, None

        if result == "calluser":
            reason = (
                call_user_prompt(thought)
                if thought
                else "Agent requested user intervention"
            )
            return "calluser", thought, action_str, reason

        if result is True:
            settle_secs = _SETTLE_TIMES.get(parsed_action_name, 0.5)
            if settle_secs > 0:
                await asyncio.sleep(settle_secs)

            try:
                await asyncio.wait_for(
                    page.wait_for_load_state("domcontentloaded", timeout=5000),
                    timeout=6.0,
                )
            except Exception:
                pass

            after_screenshot = await page.screenshot(type="png", full_page=False)
            after_hash = _screenshot_hash(after_screenshot)

            if before_hash == after_hash:
                logger.warning(
                    "Pixel hash unchanged (step %d, attempt %d): Screenshots identical after action",
                    step_index,
                    attempt + 1,
                )
                if attempt < MAX_RETRIES:
                    extra_wait = 1.5 * (attempt + 1)
                    await asyncio.sleep(extra_wait)
                    retry_screenshot = await page.screenshot(
                        type="png", full_page=False
                    )
                    if _screenshot_hash(retry_screenshot) != before_hash:
                        after_screenshot = retry_screenshot
                        after_hash = _screenshot_hash(after_screenshot)
                        logger.info(
                            "Pixel change detected after extra wait (step %d, attempt %d)",
                            step_index,
                            attempt + 1,
                        )
                    else:
                        last_error = "Screenshots identical after action — no visible change detected"
                        continue
                else:
                    last_error = "Screenshots identical after action — no visible change detected"
                    continue

            if location is not None and location.confidence == "high":
                logger.info(
                    "Skipping VLM verify — grounding confidence=high + pixel hash changed (step %d)",
                    step_index,
                )
                history.append(
                    {
                        "thought": thought,
                        "action": action_str,
                        "screenshot": compress_screenshot(after_screenshot),
                    }
                )
                return True, thought, action_str, None

            transition_desc, succeeded = await _verify_action(
                client,
                before_screenshot,
                after_screenshot,
                action_str=action_str,
                expected_outcome=expected_outcome,
            )
            logger.info(
                "State transition (step %d): %s", step_index, transition_desc[:120]
            )

            if succeeded:
                history.append(
                    {
                        "thought": thought,
                        "action": action_str,
                        "screenshot": compress_screenshot(after_screenshot),
                    }
                )
                return True, thought, action_str, None

            last_error = f"Action appeared to have no effect: {transition_desc[:200]}"
            logger.warning(
                "State-transition VERDICT: failed (attempt %d, step %d): %s",
                attempt + 1,
                step_index,
                last_error,
            )
            continue

        last_error = f"Operator returned False for action: {action_str}"
        logger.warning(
            "EchoPrism operator failed (attempt %d): %s", attempt + 1, last_error
        )

    return (
        "calluser",
        thought,
        action_str,
        f"Stuck after {MAX_RETRIES + 1} attempts — {last_error or 'no clear reason'}",
    )


# --- Remote inference (WebSocket): no execution, returns action for client to execute ---


async def run_ambiguous_step_inference(
    screenshot_bytes: bytes,
    step_data: dict[str, Any],
    step_index: int,
    total: int,
    history: list[dict[str, Any]] | None = None,
    workflow_type: WorkflowType = "browser",
    api_key: str | None = None,
    owner_uid: str | None = None,
    db: Any | None = None,
    cached_prompt: str | None = None,
    last_error_from_client: str = "",
) -> tuple[bool | AgentSignal, str, str, dict[str, Any] | None, str | None]:
    """
    Inference-only: no execution. Returns (result, thought, action_str, parsed_action_dict, error).
    Client executes parsed_action_dict locally, captures after screenshot, then calls verify_state_transition.
    - result: True | "finished" | "calluser"
    - parsed_action_dict: OperatorAction to execute (None for finished/calluser)
    """
    if not HAS_GENAI:
        return False, "", "", None, "google-genai not installed"

    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        return False, "", "", None, "GEMINI_API_KEY not set"

    model = _resolve_model(owner_uid, db)
    logger.info(
        "EchoPrism inference step %d/%d using model: %s", step_index, total, model
    )

    history = history or []
    instruction = step_instruction(step_data, step_index, total)
    expected_outcome = step_data.get("expected_outcome", "")
    step_action = (step_data.get("action") or "").lower().replace("_", "")

    client = _get_client(key)
    sys = system_prompt(instruction, workflow_type)

    # Seed last_error from client-side verification failure (e.g. "screenshots identical")
    last_error = last_error_from_client or ""
    thought = ""
    action_str = ""

    for attempt in range(MAX_RETRIES + 1):
        current_screenshot = screenshot_bytes

        # OmniParser: detect UI elements once per attempt
        omniparser_result = None
        screen_info = ""
        if HAS_OMNIPARSER and omniparser_parse is not None:
            try:
                omniparser_result = await omniparser_parse(
                    current_screenshot, OMNIPARSER_URL
                )
                if omniparser_result:
                    screen_info = omniparser_result.screen_info
                    set_omniparser_element_count(
                        len(omniparser_result.parsed_content_list)
                    )
                else:
                    set_omniparser_element_count(0)
            except Exception as e:
                logger.warning(
                    "OmniParser call failed (inference step %d, attempt %d): %s",
                    step_index,
                    attempt + 1,
                    e,
                )
                set_omniparser_element_count(0)
        else:
            set_omniparser_element_count(0)

        scene_caption = ""
        # Skip perceive_scene when OmniParser already provides element context
        if attempt == 0 and not screen_info and step_action not in _SKIP_SCENE_ACTIONS:
            compressed_for_scene = compress_screenshot(current_screenshot)
            scene_caption = await perceive_scene(
                client, compressed_for_scene, GROUNDING_MODEL
            )
            if scene_caption:
                logger.debug(
                    "Scene caption (step %d): %s...", step_index, scene_caption[:100]
                )

        try:
            if history:
                img_bytes = compress_screenshot(current_screenshot)
                _, summary = build_context(history, n_images=2)
                history_text = history_summary_text(summary)
            else:
                img_bytes = compress_screenshot(current_screenshot)
                history_text = ""
        except ValueError:
            img_bytes = compress_screenshot(current_screenshot)
            history_text = ""

        # SOM image override for inference path (same logic as run_ambiguous_step)
        if omniparser_result and omniparser_result.som_image_base64:
            try:
                img_bytes = base64.b64decode(omniparser_result.som_image_base64)
                logger.debug(
                    "Using SOM annotated image for Gemini Think phase (inference step %d, attempt %d)",
                    step_index,
                    attempt + 1,
                )
            except Exception as e:
                logger.warning(
                    "Failed to decode SOM image, using raw screenshot: %s", e
                )

        effective_instruction = instruction
        # Inject scene caption and detected elements into prompt context
        context_parts = []
        if scene_caption and attempt == 0:
            context_parts.append(f"[Scene Overview]\n{scene_caption}")
        elem_count = len(omniparser_result.parsed_content_list) if omniparser_result else 0
        elements_ctx = detected_elements_context(screen_info, element_count=elem_count)
        if elements_ctx:
            context_parts.append(elements_ctx)
        if context_parts:
            effective_instruction = "\n\n".join(context_parts) + "\n\n" + instruction

        extra_context = _build_retry_context(last_error)
        use_system2 = os.environ.get("ECHO_SYSTEM2_SAMPLING", "").lower() in (
            "1",
            "true",
            "yes",
        )

        if (
            use_system2
            and step_action
            in ("click", "clickat", "doubleclick", "rightclick", "hover", "drag")
            and attempt == 0
        ):
            samples, samp_err = await _call_gemini_n_samples(
                client,
                effective_instruction,
                img_bytes,
                sys,
                history_text=history_text,
                model=model,
                cached_content=cached_prompt,
            )
            consensus = _system2_consensus(samples) if not samp_err else None
            if consensus:
                thought, parsed = consensus
            elif samples:
                voice_fallback = os.environ.get(
                    "ECHO_SYSTEM2_VOICE_FALLBACK", ""
                ).lower() in ("1", "true", "yes")
                if voice_fallback:
                    return (
                        "calluser",
                        "I'm seeing a few different buttons here.",
                        "",
                        None,
                        "I'm seeing a few different buttons here - which one did you mean?",
                    )
                thought, parsed = samples[0][0], samples[0][1]
                if parsed is None:
                    last_error = "System-2: no parseable consensus"
                    continue
            else:
                last_error = samp_err or "System-2: no valid samples"
                continue
        else:
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
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(1.0 * (attempt + 1))
                continue

            thought = extract_thought(raw_text)
            parsed = parse_action(raw_text)
            logger.info(
                "VLM raw output (inference step %d, attempt %d):\n%s",
                step_index, attempt + 1, (raw_text or ""),
            )
            logger.info(
                "Parsed action (inference step %d, attempt %d): %s",
                step_index, attempt + 1, parsed,
            )

        if not parsed:
            last_error = f"Could not parse action from model output: {raw_text[:200]}"
            if attempt < MAX_RETRIES:
                await asyncio.sleep(0.5)
            continue

        parsed_action_name = parsed.get("action", "")

        parsed, location = await resolve_coords_for_action(
            parsed,
            current_screenshot,
            client,
            step_data,
            omniparser_result=omniparser_result,
        )
        if location and location.confidence in ("high", "medium"):
            logger.info(
                "Locator override (step %d, confidence=%s): (%d, %d)",
                step_index,
                location.confidence,
                location.center_x,
                location.center_y,
            )

        skip_keys = {"action"}
        kv = {k: v for k, v in parsed.items() if k not in skip_keys}
        action_str = f"{parsed_action_name}({', '.join(str(v) for v in kv.values())})"

        if parsed_action_name == "finished":
            return "finished", thought, action_str, None, None
        if parsed_action_name == "calluser":
            reason = (
                call_user_prompt(thought)
                if thought
                else "Agent requested user intervention"
            )
            return "calluser", thought, action_str, None, reason

        return True, thought, action_str, parsed, None

    return (
        "calluser",
        thought,
        action_str,
        None,
        f"Stuck after {MAX_RETRIES + 1} attempts — {last_error or 'no clear reason'}",
    )


async def verify_state_transition(
    before_bytes: bytes,
    after_bytes: bytes,
    action_str: str = "",
    expected_outcome: str = "",
    api_key: str | None = None,
) -> tuple[str, bool]:
    """
    Public API for state-transition verification. Used by WebSocket clients after executing an action.
    Returns (description, succeeded).
    """
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        return "GEMINI_API_KEY not set", True  # assume success to avoid blocking

    client = _get_client(key)
    return await _verify_action(
        client, before_bytes, after_bytes, action_str, expected_outcome
    )
