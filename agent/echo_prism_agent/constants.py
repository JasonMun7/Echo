"""
Central defaults for EchoPrism (numbers, model IDs, env fallbacks, small sets).

Long system prompts and action-space documents live in ``model_prompts.py``.
"""

from __future__ import annotations

import os
from typing import Any

# --- Package ------------------------------------------------------------------
PACKAGE_VERSION = "0.1.0"

# --- LangGraph / inference ----------------------------------------------------
MAX_INFERENCE_FAILURES = 4
DEFAULT_GUI_RUN_MAX_LOOPS = 100
# Legacy inner retry cap: ``range(MAX_RETRIES + 1)`` → four attempts.
MAX_RETRIES = 3

# --- Screenshot smart resize (same geometry as legacy UI-TARS-desktop vlm.ts) ---
RESIZE_FACTOR = 28  # IMAGE_FACTOR
MIN_PIXELS = 100 * RESIZE_FACTOR * RESIZE_FACTOR
MAX_PIXELS_V1_0 = 2700 * RESIZE_FACTOR * RESIZE_FACTOR
MAX_PIXELS_VLM_HIGH = 16384 * RESIZE_FACTOR * RESIZE_FACTOR  # high-res VLM budget (Kimi default path)
MAX_PIXELS_UI_TARS_1_5 = MAX_PIXELS_VLM_HIGH  # deprecated alias
# Legacy: tighter budget when not using high-res profile
MAX_PIXELS = MAX_PIXELS_V1_0
MAX_RATIO = 200.0
MAX_CONTEXT_IMAGES = 5
LOW_DETAIL_MAX_PIXELS = 1024 * 1024
HIGH_DETAIL_MAX_PIXELS = 2048 * 1960

# --- Normalized coordinates (0–1000 executor scale) -------------------------
NORM_COORD_SCALE = 1000
UI_TARS_COORD_SCALE = NORM_COORD_SCALE  # deprecated alias

# --- Playwright defaults ------------------------------------------------------
DEFAULT_PLAYWRIGHT_VIEWPORT_WIDTH = 1280
DEFAULT_PLAYWRIGHT_VIEWPORT_HEIGHT = 936

# --- Gemini model IDs (env defaults; see models_config) ------------------------
DEFAULT_SYNTHESIS_MODEL = "gemini-3-flash-preview"
DEFAULT_CHAT_MODEL = "gemini-3.1-pro-preview"
DEFAULT_VOICE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"
DEFAULT_TRACE_SCORING_MODEL = "gemini-3-flash-preview"

# --- OpenRouter / httpx --------------------------------------------------------
DEFAULT_OPENROUTER_TIMEOUT_S = 120.0
DEFAULT_OPENROUTER_MAX_TOKENS_1_5 = 2048
DEFAULT_OPENROUTER_MAX_TOKENS_LEGACY = 1024
DEFAULT_OPENROUTER_TEMPERATURE = 0.2
OPENROUTER_HTTP_REFERER_DEFAULT = "https://echo.local"
OPENROUTER_TITLE_DEFAULT = "Echo Prism LangGraph"
# Default GUI inference model (OpenRouter slug) — same family as UI-TARS-desktop + OpenRouter.
DEFAULT_UI_TARS_MODEL_ID = "bytedance/ui-tars-1.5-7b"
DEFAULT_INFERENCE_MODEL_ID = DEFAULT_UI_TARS_MODEL_ID


def effective_ui_tars_model_id() -> str:
    """
    OpenRouter GUI inference default when ``UI_TARS_MODEL_ID`` is unset
    (must match ``openrouter_vision.chat_completions_vision``).
    """
    return (
        (os.environ.get("UI_TARS_MODEL_ID") or "").strip()
        or (os.environ.get("ECHOPRISM_INFERENCE_MODEL") or "").strip()
        or DEFAULT_UI_TARS_MODEL_ID
    )


OPENROUTER_BASE_URL_DEFAULT = "https://openrouter.ai/api/v1"
HTTPX_MAX_KEEPALIVE_CONNECTIONS = 8
HTTPX_MAX_CONNECTIONS = 16

# --- Trace filter (rule pass) --------------------------------------------------
WAIT_EXCESS_THRESHOLD_SECONDS = 10.0

# --- Optional muscle-mem verification tools (``VerificationResultToolProvider``) ---
VERIFICATION_CONCLUSIONS: frozenset[str] = frozenset(
    {
        "SUCCESS",
        "FAILURE",
        "PARTIAL",
    }
)

# --- Grounding actions (pixel coords required) --------------------------------
GROUNDING_ACTIONS: frozenset[str] = frozenset(
    {
        "click",
        "doubleclick",
        "rightclick",
        "hover",
        "drag",
        "clickandtype",
    }
)

# --- Workflow synthesis --------------------------------------------------------
FRAME_PIXEL_DIFF_SAMPLE_BYTES = 10000
FRAME_CHANGE_THRESHOLD_DEFAULT = 0.03
SYNTHESIS_FRAME_MAX_DIM = 1024
SYNTHESIS_FRAME_MAX_OUTPUT_TOKENS = 2048
SYNTHESIS_FRAME_TEMPERATURE = 0.2
SYNTHESIS_FRAME_REQUEST_TIMEOUT_S = 45.0
TITLE_MAX_STEPS_FOR_SUMMARY = 10
TITLE_CONTEXT_SLICE_CHARS = 80
TITLE_MAX_OUTPUT_TOKENS = 32
TITLE_GENERATION_TIMEOUT_S = 10.0
HISTORY_ROLLING_STEPS = 5
HISTORY_CONTEXT_SLICE_CHARS = 120
JSON_ERROR_LOG_TRUNCATE_CHARS = 500
MEDIA_SYNTHESIS_TEMPERATURE = 0.2

# --- Voice / LiveKit -----------------------------------------------------------
DEFAULT_AGENT_BACKEND_URL = "http://localhost:8083"
LIVEKIT_TOOL_HTTP_TIMEOUT_S = 60.0
USER_BY_PHONE_HTTP_TIMEOUT_S = 5.0
DEFAULT_ECHOPRISM_VOICE = "Puck"
LIVEKIT_REALTIME_TEMPERATURE = 0.8
PRE_CONNECT_AUDIO_TIMEOUT_S = 10.0
LIVEKIT_DATA_TOPIC = "echoprism"
VOICE_INPUT_PCM_SAMPLE_RATE = 16000

# --- Training / COCO4GUI -------------------------------------------------------
DEFAULT_CATEGORIES: list[dict[str, Any]] = [
    {"id": 1, "name": "click", "supercategory": "interaction"},
    {"id": 2, "name": "type", "supercategory": "interaction"},
    {"id": 3, "name": "select", "supercategory": "interaction"},
    {"id": 4, "name": "hover", "supercategory": "interaction"},
    {"id": 5, "name": "drag", "supercategory": "interaction"},
    {"id": 6, "name": "right_click", "supercategory": "interaction"},
    {"id": 7, "name": "double_click", "supercategory": "interaction"},
    {"id": 8, "name": "scroll", "supercategory": "interaction"},
    {"id": 9, "name": "swipe", "supercategory": "interaction"},
    {"id": 10, "name": "long_press", "supercategory": "interaction"},
    {"id": 11, "name": "focus", "supercategory": "interaction"},
]
