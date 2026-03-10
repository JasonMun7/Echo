"""
Async HTTP client for the OmniParser element-grounding service.

OmniParser runs as a separate Cloud Run GPU service (YOLO + Florence2).
Input: raw screenshot bytes (PNG/JPEG).
Output: OmniParserResult with detected UI elements, screen_info text, and optional SOM image.

Auth: Cloud Run IAM service-to-service via ID token (auto-handled by google-auth when available).
Fallback: unauthenticated for local development.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

try:
    import httpx

    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False


@dataclass
class OmniParserResult:
    """Structured result from OmniParser /parse/ endpoint."""

    parsed_content_list: list[dict[str, Any]] = field(default_factory=list)
    screen_info: str = ""
    som_image_base64: str = ""
    latency: float = 0.0


def _build_screen_info(parsed_content_list: list[dict[str, Any]]) -> str:
    """Build a human-readable element list for injection into Gemini prompts."""
    lines: list[str] = []
    for idx, element in enumerate(parsed_content_list):
        etype = element.get("type", "unknown")
        content = element.get("content", "")
        if etype == "text":
            lines.append(f'ID: {idx}, Text: "{content}"')
        elif etype == "icon":
            lines.append(f"ID: {idx}, Icon: {content}")
        else:
            lines.append(f"ID: {idx}, {etype}: {content}")
    return "\n".join(lines)


# Simple in-memory cache keyed by screenshot hash
_cache: dict[str, OmniParserResult] = {}
_CACHE_MAX_SIZE = 32


def _cache_key(img_bytes: bytes) -> str:
    return hashlib.md5(img_bytes).hexdigest()


def _get_id_token(url: str) -> str | None:
    """Attempt to get a Google ID token for service-to-service auth on Cloud Run."""
    try:
        import google.auth.transport.requests  # type: ignore
        import google.oauth2.id_token  # type: ignore

        request = google.auth.transport.requests.Request()
        return google.oauth2.id_token.fetch_id_token(request, url)
    except Exception:
        return None


async def parse_screenshot(
    img_bytes: bytes,
    omniparser_url: str,
    timeout: float = 15.0,
    use_cache: bool = True,
) -> OmniParserResult | None:
    """
    Call OmniParser /parse/ endpoint with a screenshot.

    Args:
        img_bytes: Raw screenshot bytes (PNG or JPEG).
        omniparser_url: Base URL of the OmniParser service (e.g. "https://omniparser-xxx.run.app").
        timeout: Request timeout in seconds.
        use_cache: If True, cache results keyed by screenshot hash.

    Returns:
        OmniParserResult on success, None on failure.
    """
    if not HAS_HTTPX:
        logger.warning("httpx not installed — OmniParser client unavailable")
        return None

    if not omniparser_url:
        return None

    if not img_bytes:
        return None

    # Check cache
    key = _cache_key(img_bytes)
    if use_cache and key in _cache:
        logger.debug("OmniParser cache hit")
        return _cache[key]

    # Encode screenshot as base64
    image_b64 = base64.b64encode(img_bytes).decode("utf-8")
    url = omniparser_url.rstrip("/") + "/parse/"

    headers: dict[str, str] = {"Content-Type": "application/json"}
    # Try Cloud Run IAM auth
    id_token = _get_id_token(omniparser_url)
    if id_token:
        headers["Authorization"] = f"Bearer {id_token}"

    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                url,
                json={"base64_image": image_b64},
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException:
        logger.warning("OmniParser request timed out after %.1fs", timeout)
        return None
    except Exception as e:
        logger.warning("OmniParser request failed: %s", e)
        return None

    elapsed = time.monotonic() - start
    parsed_content_list = data.get("parsed_content_list", [])
    screen_info = _build_screen_info(parsed_content_list)
    som_image_base64 = data.get("som_image_base64", "")
    server_latency = data.get("latency", 0.0)

    result = OmniParserResult(
        parsed_content_list=parsed_content_list,
        screen_info=screen_info,
        som_image_base64=som_image_base64,
        latency=server_latency,
    )

    logger.info(
        "OmniParser: %d elements detected in %.2fs (server: %.2fs)",
        len(parsed_content_list),
        elapsed,
        server_latency,
    )

    # Store in cache (evict oldest if full)
    if use_cache:
        if len(_cache) >= _CACHE_MAX_SIZE:
            oldest_key = next(iter(_cache))
            del _cache[oldest_key]
        _cache[key] = result

    return result


def resolve_element_coords(
    element_id: int,
    omniparser_result: OmniParserResult,
) -> tuple[int, int, list[int]] | None:
    """
    Look up an element by ID and convert its bbox to 0-1000 coordinates.

    OmniParser bbox format: [x_min, y_min, x_max, y_max] in 0-1 normalized float.
    Returns (center_x, center_y, box_2d) in 0-1000 space, or None if invalid.
    box_2d format: [y_min, x_min, y_max, x_max] to match ElementLocation convention.
    """
    elements = omniparser_result.parsed_content_list
    if element_id < 0 or element_id >= len(elements):
        logger.warning(
            "OmniParser element_id %d out of range (0-%d)",
            element_id,
            len(elements) - 1,
        )
        return None

    element = elements[element_id]
    bbox = element.get("bbox")
    if not bbox or len(bbox) != 4:
        logger.warning("OmniParser element %d has no valid bbox", element_id)
        return None

    x_min, y_min, x_max, y_max = [float(v) for v in bbox]
    center_x = int((x_min + x_max) / 2 * 1000)
    center_y = int((y_min + y_max) / 2 * 1000)

    # box_2d in ElementLocation format: [y_min, x_min, y_max, x_max]
    box_2d = [
        int(y_min * 1000),
        int(x_min * 1000),
        int(y_max * 1000),
        int(x_max * 1000),
    ]

    return center_x, center_y, box_2d
