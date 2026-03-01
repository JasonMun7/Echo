"""
Token optimization for screenshot-heavy workloads.
- Resize/downscale to max dimension
- JPEG compression
- Observation window (last N screenshots)
- Text summaries for older steps
"""
import io
from typing import Any

# Pillow is commonly available; fallback to no-op if not
try:
    from PIL import Image

    HAS_PIL = True
except ImportError:
    HAS_PIL = False


def compress_screenshot(
    data: bytes,
    max_dim: int = 1280,
    quality: int = 85,
    format: str = "JPEG",
) -> bytes:
    """
    Resize screenshot to max dimension and compress as JPEG.
    Preserves aspect ratio. Returns bytes.
    Use max_dim=768 for state-transition verify screenshots (halves token cost).
    """
    if not HAS_PIL or not data:
        return data

    try:
        img = Image.open(io.BytesIO(data))
        # Unconditional RGB convert — handles RGBA, P, L, and other modes
        img = img.convert("RGB")
        w, h = img.size
        if w > max_dim or h > max_dim:
            scale = min(max_dim / w, max_dim / h)
            new_w = int(w * scale)
            new_h = int(h * scale)
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format=format, quality=quality)
        return buf.getvalue()
    except Exception:
        return data


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
