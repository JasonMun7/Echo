"""
EchoPrism Locator Agent — element localization for UI automation.

Primary path: OmniParser element ID lookup (deterministic, pixel-accurate).
Fallback: Gemini VLM structured grounding (when OmniParser is unavailable).

Called by Runner when semantic actions need coordinates.

Tools:
- locate(screenshot, description, ..., omniparser_result, element_id) -> ElementLocation | None
- locate_by_element_id(element_id, omniparser_result) -> ElementLocation | None
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from echo_prism.models_config import LOCATOR_MODEL
from echo_prism.utils.omniparser_client import OmniParserResult, resolve_element_coords

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


# ---------------------------------------------------------------------------
# OmniParser-based grounding (preferred)
# ---------------------------------------------------------------------------

def locate_by_element_id(
    element_id: int,
    omniparser_result: OmniParserResult,
) -> ElementLocation | None:
    """
    Resolve an OmniParser element ID to an ElementLocation.

    OmniParser detection is deterministic → confidence is always "high".
    Returns None if element_id is out of range or bbox is missing.
    """
    coords = resolve_element_coords(element_id, omniparser_result)
    if coords is None:
        return None

    center_x, center_y, box_2d = coords
    elements = omniparser_result.parsed_content_list
    label = elements[element_id].get("content", "") if element_id < len(elements) else ""

    return ElementLocation(
        center_x=center_x,
        center_y=center_y,
        box_2d=box_2d,
        label=label,
        confidence="high",
    )


# ---------------------------------------------------------------------------
# Gemini VLM fallback (used when OmniParser is unavailable)
# ---------------------------------------------------------------------------

async def _ground_element_gemini_fallback(
    client: Any,
    img_bytes: bytes,
    description: str,
    model: str,
) -> ElementLocation | None:
    """
    Structured element grounding via Gemini response_schema.
    Given a natural language description, returns center (x, y) and box in 0-1000 space.
    Used as fallback when OmniParser is unavailable.
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
        logger.warning("ground_element (Gemini fallback) failed for '%s': %s", description[:60], e)
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def locate(
    client: Any,
    img_bytes: bytes,
    description: str,
    model: str | None = None,
    omniparser_result: OmniParserResult | None = None,
    element_id: int | None = None,
) -> ElementLocation | None:
    """
    Locate a UI element in the screenshot.

    Primary path (OmniParser): if element_id and omniparser_result are provided,
    looks up the element by ID — instant, deterministic, confidence="high".

    Fallback path (Gemini VLM): if OmniParser data is not available, uses Gemini
    structured grounding with the description.

    Returns ElementLocation or None on failure.
    """
    # OmniParser path: element ID lookup
    if element_id is not None and omniparser_result is not None:
        location = locate_by_element_id(element_id, omniparser_result)
        if location is not None:
            logger.info("Locator: OmniParser element %d → (%d, %d)", element_id, location.center_x, location.center_y)
            return location
        logger.warning("Locator: OmniParser element_id %d lookup failed, falling back to Gemini", element_id)

    # Gemini VLM fallback
    m = model or LOCATOR_MODEL
    return await _ground_element_gemini_fallback(client, img_bytes, description, m)
