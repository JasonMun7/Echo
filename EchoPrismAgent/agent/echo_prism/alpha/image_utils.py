"""
Token optimization for screenshot-heavy workloads.
- Smart resize maintaining aspect ratio within VLM-optimal ranges (adapted from UI-TARS)
- Dynamic detail level selection based on pixel count
- WebP compression (falls back to JPEG)
- Observation window (last N screenshots)
- Text summaries for older steps
"""
import io
import logging
import math
from typing import Any

logger = logging.getLogger(__name__)

# Pillow is commonly available; fallback to no-op if not
try:
    from PIL import Image

    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# --- UI-TARS Smart Resize Constants ---
# These ensure consistent coordinate scaling for VLM input.
MIN_PIXELS = 300 * 300        # Don't shrink below this
MAX_PIXELS = 1024 * 1024      # Don't exceed this (matches VLM context windows)
MAX_RATIO = 4.0               # Max aspect ratio before padding
RESIZE_FACTOR = 28            # Round dimensions to this factor (VLM patch size)

# --- Detail level thresholds (adapted from UI-TARS) ---
LOW_DETAIL_MAX_PIXELS = 1024 * 1024      # ≤ this → low detail
HIGH_DETAIL_MAX_PIXELS = 2048 * 1960     # ≤ this → high detail


def smart_resize(
    width: int,
    height: int,
    factor: int = RESIZE_FACTOR,
    min_pixels: int = MIN_PIXELS,
    max_pixels: int = MAX_PIXELS,
    max_ratio: float = MAX_RATIO,
) -> tuple[int, int]:
    """
    Compute optimal resize dimensions for VLM input (adapted from UI-TARS smartResizeForV15).

    Maintains aspect ratio, rounds to factor multiples, and constrains within
    min/max pixel ranges. This ensures the VLM receives consistently-sized images
    which improves coordinate prediction accuracy.

    Returns (new_width, new_height) — both multiples of `factor`.
    """
    if width <= 0 or height <= 0:
        return width, height

    # Enforce maximum aspect ratio
    ratio = max(width, height) / min(width, height) if min(width, height) > 0 else 1.0
    if ratio > max_ratio:
        if width > height:
            width = int(height * max_ratio)
        else:
            height = int(width * max_ratio)

    # Scale to fit within min/max pixel bounds
    total = width * height
    if total > max_pixels:
        scale = math.sqrt(max_pixels / total)
        width = int(width * scale)
        height = int(height * scale)
    elif total < min_pixels:
        scale = math.sqrt(min_pixels / total)
        width = int(width * scale)
        height = int(height * scale)

    # Round to nearest factor multiple
    new_w = max(factor, round(width / factor) * factor)
    new_h = max(factor, round(height / factor) * factor)

    return new_w, new_h


def get_detail_level(width: int, height: int) -> str:
    """
    Select VLM detail level based on image pixel count (adapted from UI-TARS).

    Returns:
        'low'  — for images ≤ 1024×1024 (faster, fewer tokens)
        'high' — for images ≤ 2048×1960 (more detail)
        'auto' — for larger images
    """
    pixels = width * height
    if pixels <= LOW_DETAIL_MAX_PIXELS:
        return "low"
    if pixels <= HIGH_DETAIL_MAX_PIXELS:
        return "high"
    return "auto"


def compress_screenshot(
    data: bytes,
    max_dim: int = 1280,
    quality: int = 85,
    format: str = "JPEG",
    use_smart_resize: bool = True,
) -> bytes:
    """
    Resize screenshot and compress for VLM input.

    When use_smart_resize=True (default), uses UI-TARS-style smart resizing that
    maintains aspect ratio within VLM-optimal pixel ranges and rounds to patch
    size multiples. This produces more accurate coordinate predictions.

    When use_smart_resize=False, falls back to simple max-dimension capping.

    Uses WebP format when available for 50-70% better compression than JPEG.
    Falls back to JPEG if WebP encoding fails.
    """
    if not HAS_PIL or not data:
        return data

    try:
        img = Image.open(io.BytesIO(data))
        img = img.convert("RGB")
        w, h = img.size

        if use_smart_resize:
            new_w, new_h = smart_resize(w, h)
            if (new_w, new_h) != (w, h):
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                logger.debug(
                    "compress_screenshot: %dx%d → %dx%d (smart_resize)",
                    w, h, new_w, new_h,
                )
            else:
                logger.debug("compress_screenshot: %dx%d (no resize needed)", w, h)
        else:
            if w > max_dim or h > max_dim:
                scale = min(max_dim / w, max_dim / h)
                new_w = int(w * scale)
                new_h = int(h * scale)
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

        buf = io.BytesIO()
        # Try WebP first for better compression, fall back to JPEG
        try:
            img.save(buf, format="WEBP", quality=80)
            result = buf.getvalue()
            if len(result) > 0:
                return result
        except Exception:
            pass

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        return buf.getvalue()
    except Exception:
        return data


def compress_screenshot_for_verify(data: bytes) -> bytes:
    """Compress screenshot specifically for state-transition verification (smaller)."""
    return compress_screenshot(data, max_dim=768, use_smart_resize=False)


def build_context(
    history: list[dict[str, Any]],
    n_images: int = 3,
    summarize_older: bool = True,
) -> tuple[list[bytes], str]:
    """
    Build context for agent: last N screenshots + text summary of older steps.
    Returns (screenshot_bytes_list, summary_text).
    Raises ValueError if history is empty.
    """
    if not history:
        raise ValueError("build_context: history must not be empty")

    recent = history[-n_images:] if len(history) >= n_images else history
    screenshots: list[bytes] = []
    for entry in recent:
        if isinstance(entry.get("screenshot"), bytes):
            screenshots.append(entry["screenshot"])
        elif isinstance(entry.get("observation"), bytes):
            screenshots.append(entry["observation"])

    summary = ""
    if summarize_older and len(history) > n_images:
        older = history[:-n_images]
        parts = []
        for i, entry in enumerate(older):
            thought = entry.get("thought", entry.get("t", ""))
            action = entry.get("action", entry.get("a", ""))
            if thought or action:
                # i is 0-indexed over older entries; step number is i+1
                parts.append(f"Step {i + 1}: Thought: {thought[:200]}... Action: {str(action)[:80]}")
        summary = "\n".join(parts) if parts else ""

    return screenshots, summary


def scale_coords(
    x: int | float,
    y: int | float,
    from_scale: int,
    to_width: int,
    to_height: int,
) -> tuple[int, int]:
    """
    Scale normalized coordinates (0-from_scale) to actual screen resolution.
    """
    fx = x / from_scale if from_scale else 0
    fy = y / from_scale if from_scale else 0
    return int(fx * to_width), int(fy * to_height)
