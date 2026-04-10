"""
Token optimization for screenshot-heavy workloads.
- Smart resize maintaining aspect ratio within VLM-optimal ranges (adapted from UI-TARS)
- Dynamic detail level selection based on pixel count
- WebP compression (falls back to JPEG)
- Observation window (last N screenshots)
- Text summaries for older steps
"""

from __future__ import annotations

import io
import logging
import math
import os
import tempfile
from pathlib import Path
from typing import Any

from echo_prism_agent.constants import (
    HIGH_DETAIL_MAX_PIXELS,
    LOW_DETAIL_MAX_PIXELS,
    MAX_PIXELS_UI_TARS_1_5,
    MAX_PIXELS_V1_0,
    MAX_RATIO,
    MIN_PIXELS,
    RESIZE_FACTOR,
    effective_ui_tars_model_id,
)

logger = logging.getLogger(__name__)

# Pillow is commonly available; fallback to no-op if not
try:
    from PIL import Image

    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Legacy alias (non–1.5 heuristic)
MAX_PIXELS = MAX_PIXELS_V1_0


def smart_resize(
    width: int,
    height: int,
    factor: int = RESIZE_FACTOR,
    min_pixels: int = MIN_PIXELS,
    max_pixels: int = MAX_PIXELS_V1_0,
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


def _round_by_factor(num: float, factor: int) -> int:
    return int(round(num / factor) * factor)


def _floor_by_factor(num: float, factor: int) -> int:
    return int(math.floor(num / factor) * factor)


def _ceil_by_factor(num: float, factor: int) -> int:
    return int(math.ceil(num / factor) * factor)


def smart_resize_for_v15(
    width: int,
    height: int,
    *,
    max_ratio: float = MAX_RATIO,
    factor: int = RESIZE_FACTOR,
    min_pixels: int = MIN_PIXELS,
    max_pixels: int = MAX_PIXELS_UI_TARS_1_5,
) -> tuple[int, int] | None:
    """Parity with UI-TARS-desktop ``smartResizeForV15`` (``actionParser.ts``)."""
    if width <= 0 or height <= 0:
        return None
    if max(width, height) / min(width, height) > max_ratio:
        return None
    w_bar = max(factor, _round_by_factor(width, factor))
    h_bar = max(factor, _round_by_factor(height, factor))
    if h_bar * w_bar > max_pixels:
        beta = math.sqrt((height * width) / max_pixels)
        h_bar = _floor_by_factor(height / beta, factor)
        w_bar = _floor_by_factor(width / beta, factor)
    elif h_bar * w_bar < min_pixels:
        beta = math.sqrt(min_pixels / (height * width))
        h_bar = _ceil_by_factor(height * beta, factor)
        w_bar = _ceil_by_factor(width * beta, factor)
    return (w_bar, h_bar)


def centered_square_letterbox_margins(
    content_w: int,
    content_h: int,
    square: int,
) -> tuple[float, float, float, float]:
    """Fractional LTRB margins when ``content_w``×``content_h`` is letterboxed in a ``square`` canvas."""
    s = float(square)
    scale = min(s / float(content_w), s / float(content_h))
    fw = content_w * scale
    fh = content_h * scale
    ox = (s - fw) / 2.0
    oy = (s - fh) / 2.0
    return (ox / s, oy / s, ox / s, oy / s)


def _use_ui_tars_v15() -> bool:
    mid = effective_ui_tars_model_id().lower()
    if "1.5" in mid or "ui-tars-1.5" in mid:
        return True
    ver = (os.environ.get("ECHOPRISM_UI_TARS_VERSION") or "").strip().lower()
    return ver in ("1.5", "v1.5", "v1_5")


def vlm_resize_dimensions(width: int, height: int) -> tuple[int, int]:
    """Dimensions after UI-TARS-style preprocessing (``observe_screen`` / coord remap)."""
    if _use_ui_tars_v15():
        out = smart_resize_for_v15(width, height)
        if out is not None:
            return out
    return smart_resize(width, height)


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
            if _use_ui_tars_v15():
                dims = smart_resize_for_v15(w, h)
                if dims is not None:
                    new_w, new_h = dims
                else:
                    # Match ``vlm_resize_dimensions`` fallback (not raw w×h).
                    new_w, new_h = smart_resize(w, h)
            else:
                new_w, new_h = smart_resize(w, h)
            if (new_w, new_h) != (w, h):
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                logger.debug(
                    "compress_screenshot: %dx%d → %dx%d (smart_resize)",
                    w,
                    h,
                    new_w,
                    new_h,
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
        except Exception as e:
            logger.debug(
                "compress_screenshot: WEBP encoding failed, falling back to JPEG: %s",
                e,
            )

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


# --- Video frame extraction (synthesis / media uploads) --------------------------------


def extract_frames_from_video(
    content: bytes,
    mime: str,
    max_frames: int = 120,
    fps_sample: float | None = None,
    skip_initial_seconds: float = 2.0,
) -> list[bytes]:
    """
    Extract frames from a video file and return as list of JPEG bytes.

    Args:
        content: Raw video bytes.
        mime: MIME type (video/mp4, video/webm, etc.).
        max_frames: Maximum number of frames to extract.
        fps_sample: Sample at this many frames per second. Default 1.0.
        skip_initial_seconds: Skip frames from the first N seconds to avoid share picker / setup UI.

    Returns:
        List of JPEG-encoded frame bytes.
    """
    import cv2

    if fps_sample is None:
        fps_sample = 1.0

    suffix = ".mp4"
    if "webm" in mime:
        suffix = ".webm"
    elif "quicktime" in mime or "mov" in mime:
        suffix = ".mov"

    logger.info(
        "extract_frames_from_video: content_size=%d bytes, mime=%s, suffix=%s",
        len(content),
        mime,
        suffix,
    )

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(content)
        path = f.name

    frames: list[bytes] = []
    try:
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            logger.warning("VideoCapture could not open file (codec/format issue). path=%s", path)
            return []

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_interval = max(1, int(fps / fps_sample))
        skip_frames = max(0, int(skip_initial_seconds * fps))
        if total_frames <= 0:
            skip_frames = min(skip_frames, 15)

        logger.info(
            "Video props: total_frames=%s fps=%.1f skip_frames=%d frame_interval=%d",
            total_frames,
            fps,
            skip_frames,
            frame_interval,
        )

        if total_frames > 0:
            count = 0
            idx = skip_frames
            seek_failures = 0
            while count < max_frames and idx < total_frames:
                cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
                ret, frame = cap.read()
                if not ret:
                    seek_failures += 1
                    if seek_failures >= 3:
                        break
                    idx += 1
                    continue
                seek_failures = 0
                _, jpeg = cv2.imencode(".jpg", frame)
                frames.append(jpeg.tobytes())
                count += 1
                idx += frame_interval

        if not frames and total_frames <= 0:
            reads_per_sample = max(1, int(30 / fps_sample))
            read_count = 0
            skipped = 0
            while skipped < skip_frames:
                ret, _ = cap.read()
                if not ret:
                    break
                skipped += 1
            while len(frames) < max_frames:
                ret, frame = cap.read()
                if not ret:
                    break
                if read_count % reads_per_sample == 0:
                    _, jpeg = cv2.imencode(".jpg", frame)
                    frames.append(jpeg.tobytes())
                read_count += 1

        if not frames and total_frames > 0:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            reads_per_sample = max(1, int(30 / fps_sample))
            read_count = 0
            skipped = 0
            while skipped < skip_frames:
                ret, _ = cap.read()
                if not ret:
                    break
                skipped += 1
            while len(frames) < max_frames:
                ret, frame = cap.read()
                if not ret:
                    break
                if read_count % reads_per_sample == 0:
                    _, jpeg = cv2.imencode(".jpg", frame)
                    frames.append(jpeg.tobytes())
                read_count += 1

        cap.release()
    finally:
        Path(path).unlink(missing_ok=True)

    logger.info("extract_frames_from_video: %d frames", len(frames))
    return frames
