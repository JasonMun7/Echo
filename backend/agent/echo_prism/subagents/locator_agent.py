"""
EchoPrism Locator Agent — element localization for UI automation.

Separate agent for finding element coordinates from screenshots. Swappable model
(e.g., UI-TARS). Called by Runner when semantic actions need coordinates.

Tools:
- locate(screenshot, description) -> ElementLocation | None
- refine(screenshot, box_2d, description) -> ElementLocation | None  (RegionFocus)

All grounding logic (ground_element, zoom_and_reground) lives here. Pure VLM — zero DOM access.
"""
from __future__ import annotations

import asyncio
import io
import json
import logging
from typing import Any

from echo_prism.models_config import LOCATOR_MODEL

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


async def _ground_element(
    client: Any,
    img_bytes: bytes,
    description: str,
    model: str,
) -> ElementLocation | None:
    """
    Structured element grounding via response_schema.
    Given a natural language description, returns center (x, y) and box in 0-1000 space.
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
                    media_resolution=gtypes.MediaResolution.MEDIA_RESOLUTION_HIGH,
                    temperature=0.1,
                    max_output_tokens=128,
                ),
            ),
            timeout=20.0,
        )
        if hasattr(response, "parsed") and response.parsed is not None:
            return response.parsed
        if response and response.text:
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


async def locate(
    client: Any,
    img_bytes: bytes,
    description: str,
    model: str | None = None,
) -> ElementLocation | None:
    """
    Locate a UI element in the screenshot by description.

    Returns ElementLocation with center_x, center_y, box_2d, confidence, label.
    Returns None on failure. Callers should use coords only when confidence is
    "high" or "medium".
    """
    m = model or LOCATOR_MODEL
    return await _ground_element(client, img_bytes, description, m)


async def refine(
    client: Any,
    img_bytes: bytes,
    box_2d: list[int],
    description: str,
    model: str | None = None,
) -> ElementLocation | None:
    """
    RegionFocus refinement: zoom into the bounding box and re-ground at higher
    resolution. Call when locate() returned confidence="medium".

    Returns refined ElementLocation with coordinates mapped back to full image.
    """
    if not HAS_DEPS or not img_bytes or not box_2d or len(box_2d) != 4:
        return None

    try:
        from PIL import Image  # type: ignore
    except ImportError:
        logger.debug("PIL not available — refine skipped")
        return None

    try:
        img = Image.open(io.BytesIO(img_bytes))
        W, H = img.size
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

        m = model or LOCATOR_MODEL
        sub_location = await _ground_element(client, crop_bytes, description, m)
        if sub_location is None:
            return None

        sub_cx = sub_location.center_x / 1000.0 * crop_w + x1
        sub_cy = sub_location.center_y / 1000.0 * crop_h + y1
        full_cx = int(round(sub_cx / W * 1000))
        full_cy = int(round(sub_cy / H * 1000))

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
        logger.warning("refine failed for '%s': %s", description[:60], e)
        return None
