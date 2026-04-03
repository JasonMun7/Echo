"""Context subgraph: screen dimensions, compression, and history images."""

from __future__ import annotations

from io import BytesIO
from typing import Any

from echo_prism_agent.langgraph.state.schemas import InferenceStepState
from echo_prism_agent.ui_tars.screenshot_pipeline import build_context, compress_screenshot
from echo_prism_agent.model_prompts import history_summary_text

try:
    from PIL import Image

    HAS_PIL = True
except ImportError:
    HAS_PIL = False


def observe_screen(state: InferenceStepState) -> dict[str, Any]:
    """Read image dimensions and compressed screenshot bytes."""
    raw = state["screenshot_bytes"]
    w, h = 1920, 1080
    if HAS_PIL:
        try:
            im = Image.open(BytesIO(raw))
            w, h = im.size
        except Exception:
            pass
    img_bytes = compress_screenshot(raw)
    return {
        "screen_width_px": w,
        "screen_height_px": h,
        "img_bytes": img_bytes,
    }


def build_history_context(state: InferenceStepState) -> dict[str, Any]:
    """Prior-step screenshots and summary text for multimodal think."""
    history = state.get("history") or []
    history_text = ""
    extra_images: list[bytes] | None = None
    if history:
        try:
            screenshots, summary = build_context(history, n_images=2)
            history_text = history_summary_text(summary)
            extra_images = screenshots[:2] if screenshots else None
        except ValueError:
            pass
    return {
        "history_text": history_text,
        "extra_images": extra_images,
    }
