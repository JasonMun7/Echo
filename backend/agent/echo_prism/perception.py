"""
EchoPrism 3-Tier Pure VLM Perception Pipeline.

Tier 1 — Scene Understanding: dense caption of the full UI screenshot.
Tier 2 — Structured Element Grounding: precise coordinates for a described element.
Tier 3 — State Verification: handled in echo_prism_agent.py via _verify_action().

All operations are pure VLM — zero DOM access. Only screenshots are used.

Performance optimizations:
- perceive_scene: MEDIUM media_resolution (560 tokens vs 1120), max_output_tokens=384
- ground_element: HIGH media_resolution (coordinate precision), max_output_tokens=128
- zoom_and_reground: HIGH resolution on cropped region — RegionFocus (ICCV 2025)
"""
import asyncio
import io
import logging
from typing import Any

logger = logging.getLogger(__name__)

try:
    from pydantic import BaseModel
    from google.genai import types as gtypes
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False
    BaseModel = object  # type: ignore


if HAS_DEPS:
    class ElementLocation(BaseModel):
        """Structured output for element grounding. All coords in 0-1000 normalized space."""
        center_x: int
        center_y: int
        box_2d: list[int]   # [y_min, x_min, y_max, x_max] — all values 0-1000
        label: str
        confidence: str     # "high" | "medium" | "low"
else:
    class ElementLocation:  # type: ignore
        center_x: int
        center_y: int
        box_2d: list
        label: str
        confidence: str


async def perceive_scene(client: Any, img_bytes: bytes, model: str) -> str:
    """
    Tier 1: Dense caption of the full UI screenshot.

    Called at the start of each new step (attempt==0) to give the agent
    a structured understanding of the current screen before it decides what to do.

    Returns a text description. Returns "" on any failure (fail-safe).
    """
    if not HAS_DEPS or not img_bytes:
        return ""

    prompt = (
        "Provide a dense caption of this GUI screenshot. Include:\n"
        "(a) overall layout and structure,\n"
        "(b) main regions (header, sidebar, content area, footer),\n"
        "(c) key interactive elements and their spatial relationships,\n"
        "(d) any embedded images, icons, or badges and their apparent roles.\n"
        "Be comprehensive but do not hallucinate elements that are not clearly visible."
    )

    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=[gtypes.Content(role="user", parts=[
                    gtypes.Part.from_text(text=prompt),
                    gtypes.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                ])],
                config=gtypes.GenerateContentConfig(
                    # MEDIUM resolution: 560 tokens vs 1120 for HIGH — scene layout
                    # doesn't need pixel-perfect detail, halving the token cost here.
                    media_resolution=gtypes.MediaResolution.MEDIA_RESOLUTION_MEDIUM,
                    temperature=0.2,
                    max_output_tokens=384,
                ),
            ),
            timeout=20.0,
        )
        text = ""
        if response and response.candidates:
            for c in response.candidates:
                if c.content and c.content.parts:
                    for p in c.content.parts:
                        if hasattr(p, "text") and p.text:
                            text += p.text
        return text.strip()
    except Exception as e:
        logger.warning("perceive_scene failed: %s", e)
        return ""


async def ground_element(
    client: Any,
    img_bytes: bytes,
    description: str,
    model: str,
) -> "ElementLocation | None":
    """
    Tier 2: Structured element grounding via response_schema.

    Given a natural language description of a UI element, returns its precise
    center coordinates and bounding box in 0-1000 normalized space.

    Confidence gate: callers should only use the returned coordinates when
    confidence is 'high' or 'medium'. Low confidence = element may not be found.

    Returns None on any failure (fail-safe — caller uses original/fallback coords).
    """
    if not HAS_DEPS or not img_bytes or not description:
        return None

    prompt = (
        f"Locate the following UI element in the screenshot:\n"
        f"'{description}'\n\n"
        f"Return the CENTER point and bounding box in normalized coordinates 0-1000 "
        f"where (0,0) is the top-left corner and (1000,1000) is the bottom-right corner.\n"
        f"Set confidence to:\n"
        f"  'high'   — element is clearly visible and unambiguous\n"
        f"  'medium' — element is likely correct but partially obscured or ambiguous\n"
        f"  'low'    — element may not be visible; coordinates are estimated\n"
        f"box_2d format: [y_min, x_min, y_max, x_max] — all values 0-1000."
    )

    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=[gtypes.Content(role="user", parts=[
                    gtypes.Part.from_text(text=prompt),
                    gtypes.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                ])],
                config=gtypes.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ElementLocation,
                    # HIGH resolution: coordinate precision matters for grounding.
                    # Reduced max_output_tokens — JSON with 5 fields is at most ~80 tokens.
                    media_resolution=gtypes.MediaResolution.MEDIA_RESOLUTION_HIGH,
                    temperature=0.1,
                    max_output_tokens=128,
                ),
            ),
            timeout=20.0,
        )
        # Try structured .parsed first, then fall back to JSON text parse
        if hasattr(response, "parsed") and response.parsed is not None:
            return response.parsed
        # Manual parse from text if needed
        if response and response.text:
            import json
            raw = json.loads(response.text)
            return ElementLocation(
                center_x=int(raw.get("center_x", 500)),
                center_y=int(raw.get("center_y", 500)),
                box_2d=raw.get("box_2d", [400, 400, 600, 600]),
                label=str(raw.get("label", "")),
                confidence=str(raw.get("confidence", "low")),
            )
        return None
    except Exception as e:
        logger.warning("ground_element failed for '%s': %s", description[:60], e)
        return None


async def zoom_and_reground(
    client: Any,
    img_bytes: bytes,
    box_2d: list[int],
    description: str,
    model: str,
) -> "ElementLocation | None":
    """
    RegionFocus dynamic zoom (ICCV 2025): crop to the predicted bounding box plus 20% padding,
    then re-ground at full HIGH resolution within that smaller region.

    The cropped region is re-grounded and coordinates are mapped back to the full image space.
    Achieves 28%+ improvement in grounding accuracy on dense UIs (ScreenSpot-Pro benchmark).

    Only call when ground_element() returned confidence="medium" — high confidence doesn't need
    the extra call, and low confidence suggests the element may not exist in this area.

    Returns None on any failure (caller retains previous location as fallback).
    """
    if not HAS_DEPS or not img_bytes or not box_2d or len(box_2d) != 4:
        return None

    try:
        from PIL import Image  # type: ignore
    except ImportError:
        logger.debug("PIL not available — zoom_and_reground skipped")
        return None

    try:
        img = Image.open(io.BytesIO(img_bytes))
        W, H = img.size

        # box_2d is [y_min, x_min, y_max, x_max] in 0-1000 normalized space
        y_min_n, x_min_n, y_max_n, x_max_n = [v / 1000.0 for v in box_2d]
        pad = 0.20

        x1 = max(0.0, x_min_n - pad) * W
        y1 = max(0.0, y_min_n - pad) * H
        x2 = min(1.0, x_max_n + pad) * W
        y2 = min(1.0, y_max_n + pad) * H

        cropped = img.crop((x1, y1, x2, y2))
        crop_w = x2 - x1
        crop_h = y2 - y1

        buf = io.BytesIO()
        cropped.convert("RGB").save(buf, format="JPEG", quality=85)
        crop_bytes = buf.getvalue()

        # Re-ground within the cropped region — coordinates returned are relative to crop
        sub_location = await ground_element(client, crop_bytes, description, model)
        if sub_location is None:
            return None

        # Map normalized sub-region coords back to full image 0-1000 space
        sub_cx = sub_location.center_x / 1000.0 * crop_w + x1
        sub_cy = sub_location.center_y / 1000.0 * crop_h + y1

        full_cx = int(round(sub_cx / W * 1000))
        full_cy = int(round(sub_cy / H * 1000))

        # Map box_2d back too (for potential further zoom if ever needed)
        sy_min, sx_min, sy_max, sx_max = sub_location.box_2d
        full_box = [
            int(round((sy_min / 1000.0 * crop_h + y1) / H * 1000)),
            int(round((sx_min / 1000.0 * crop_w + x1) / W * 1000)),
            int(round((sy_max / 1000.0 * crop_h + y1) / H * 1000)),
            int(round((sx_max / 1000.0 * crop_w + x1) / W * 1000)),
        ]

        if HAS_DEPS:
            return ElementLocation(
                center_x=full_cx,
                center_y=full_cy,
                box_2d=full_box,
                label=sub_location.label,
                confidence=sub_location.confidence,
            )

        obj = ElementLocation()  # type: ignore
        obj.center_x = full_cx
        obj.center_y = full_cy
        obj.box_2d = full_box
        obj.label = sub_location.label
        obj.confidence = sub_location.confidence
        return obj

    except Exception as e:
        logger.warning("zoom_and_reground failed for '%s': %s", description[:60], e)
        return None
