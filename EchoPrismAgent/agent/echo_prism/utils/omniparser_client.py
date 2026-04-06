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


DEFAULT_CONFIDENCE_THRESHOLD = 0.40

# Maximum elements to include in the VLM prompt to avoid context noise
_MAX_ELEMENTS_FOR_PROMPT = 50

# Minimum element area (fraction of screen) to include — filters near-invisible detections
_MIN_ELEMENT_AREA = 0.0003  # ~0.03% of screen


def _screen_region(cx: float, cy: float) -> str:
    """Map normalized center (0-1) to a human-readable screen region."""
    if cy < 0.15:
        vr = "top"
    elif cy > 0.85:
        vr = "bottom"
    else:
        vr = "middle"
    if cx < 0.33:
        hr = "left"
    elif cx > 0.67:
        hr = "right"
    else:
        hr = "center"
    return f"{vr}-{hr}"


def _build_screen_info(
    parsed_content_list: list[dict[str, Any]],
    confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> str:
    """Build a human-readable element list for injection into Gemini prompts.

    Filters out low-confidence and tiny detections, adds spatial position,
    ranks by usefulness, and caps at _MAX_ELEMENTS_FOR_PROMPT.
    """
    candidates: list[tuple[float, int, str]] = []  # (score, idx, line)
    for idx, element in enumerate(parsed_content_list):
        confidence = element.get("confidence", 1.0)
        if confidence < confidence_threshold:
            continue

        bbox = element.get("bbox")
        if not bbox or len(bbox) != 4:
            continue

        x_min, y_min, x_max, y_max = [float(v) for v in bbox]
        w = abs(x_max - x_min)
        h = abs(y_max - y_min)
        area = w * h

        # Skip near-invisible elements
        if area < _MIN_ELEMENT_AREA:
            continue

        etype = element.get("type", "unknown")
        content = element.get("content", "").strip()
        if not content:
            continue

        # Center in 0-1000 coords and screen region
        cx = (x_min + x_max) / 2
        cy = (y_min + y_max) / 2
        cx_1k = int(cx * 1000)
        cy_1k = int(cy * 1000)
        region = _screen_region(cx, cy)

        if etype == "text":
            line = f'ID:{idx} Text:"{content}" pos:({cx_1k},{cy_1k}) region:{region}'
        elif etype == "icon":
            line = f'ID:{idx} Icon:{content} pos:({cx_1k},{cy_1k}) region:{region}'
        else:
            line = f'ID:{idx} {etype}:{content} pos:({cx_1k},{cy_1k}) region:{region}'

        # Score: larger, higher-confidence elements rank first
        score = confidence * (area ** 0.5)
        candidates.append((score, idx, line))

    # Sort by score descending, keep top N
    candidates.sort(key=lambda x: x[0], reverse=True)
    lines = [c[2] for c in candidates[:_MAX_ELEMENTS_FOR_PROMPT]]
    # Re-sort by vertical then horizontal position for readability
    # (extract pos from line)
    return "\n".join(lines)


# Simple in-memory cache keyed by screenshot hash
_cache: dict[str, OmniParserResult] = {}
_CACHE_MAX_SIZE = 32


def _cache_key(img_bytes: bytes) -> str:
    return hashlib.md5(img_bytes).hexdigest()


def _find_service_account() -> str | None:
    """Find the service-account.json file by searching common locations."""
    import os
    from pathlib import Path

    # Explicit env var (absolute path)
    sa = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
    if sa and os.path.isabs(sa) and os.path.isfile(sa):
        return sa

    # Relative path from env var — resolve against known directories
    filename = sa if sa else "service-account.json"
    search_dirs = [
        Path.cwd(),
        Path(__file__).resolve().parent.parent.parent.parent,  # EchoPrismAgent/
        Path(__file__).resolve().parent.parent.parent.parent.parent / "backend",  # echo/backend/
    ]
    for d in search_dirs:
        candidate = d / filename
        if candidate.is_file():
            return str(candidate.resolve())
    return None


# Cache the token + expiry to avoid re-fetching on every request
_cached_token: str | None = None
_cached_token_expiry: float = 0.0


def _get_id_token(url: str) -> str | None:
    """Get a Google ID token for Cloud Run service-to-service auth.

    Uses explicit service account file loading instead of default credentials
    to avoid issues with relative paths and credential caching.
    """
    global _cached_token, _cached_token_expiry

    # Return cached token if still valid (with 60s margin)
    if _cached_token and time.monotonic() < _cached_token_expiry:
        return _cached_token

    sa_path = _find_service_account()
    if not sa_path:
        logger.warning(
            "No service-account.json found — OmniParser requests will be unauthenticated. "
            "Set GOOGLE_APPLICATION_CREDENTIALS to an absolute path."
        )
        return None

    try:
        from google.oauth2 import service_account as sa_mod  # type: ignore
        import google.auth.transport.requests  # type: ignore

        credentials = sa_mod.IDTokenCredentials.from_service_account_file(
            sa_path, target_audience=url
        )
        request = google.auth.transport.requests.Request()
        credentials.refresh(request)
        _cached_token = credentials.token
        # ID tokens are valid for ~1 hour; cache for 50 minutes
        _cached_token_expiry = time.monotonic() + 3000
        logger.info("OmniParser auth: got ID token from %s", sa_path)
        return _cached_token
    except Exception as e:
        logger.warning("Failed to get ID token from %s: %s", sa_path, e)
        return None


async def parse_screenshot(
    img_bytes: bytes,
    omniparser_url: str,
    timeout: float = 30.0,
    use_cache: bool = True,
    confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
    retry_on_failure: bool = True,
) -> OmniParserResult | None:
    """
    Call OmniParser /parse/ endpoint with a screenshot.

    Args:
        img_bytes: Raw screenshot bytes (PNG or JPEG).
        omniparser_url: Base URL of the OmniParser service (e.g. "https://omniparser-xxx.run.app").
        timeout: Request timeout in seconds. Default increased to 30s to handle Cloud Run cold starts.
        use_cache: If True, cache results keyed by screenshot hash.
        confidence_threshold: Filter out elements below this confidence.
        retry_on_failure: If True, retry once with reduced image resolution on timeout/failure.

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

    result = await _do_parse_request(img_bytes, omniparser_url, timeout, confidence_threshold)

    # Retry with reduced resolution on failure
    if result is None and retry_on_failure:
        reduced = _reduce_image_resolution(img_bytes, max_dim=1280)
        if reduced is not None and reduced != img_bytes:
            logger.info("OmniParser retrying with reduced resolution (max_dim=1280)")
            result = await _do_parse_request(reduced, omniparser_url, timeout + 10, confidence_threshold)

    if result is None:
        return None

    # Store in cache (evict oldest if full)
    if use_cache:
        if len(_cache) >= _CACHE_MAX_SIZE:
            oldest_key = next(iter(_cache))
            del _cache[oldest_key]
        _cache[key] = result

    return result


def _reduce_image_resolution(img_bytes: bytes, max_dim: int = 1280) -> bytes | None:
    """Downscale image to max_dim on longest side for retry. Returns None on error."""
    try:
        from PIL import Image
        import io

        img = Image.open(io.BytesIO(img_bytes))
        w, h = img.size
        if max(w, h) <= max_dim:
            return None  # Already small enough, no point retrying same size
        scale = max_dim / max(w, h)
        new_w, new_h = int(w * scale), int(h * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception as e:
        logger.warning("Failed to reduce image resolution: %s", e)
        return None


async def _do_parse_request(
    img_bytes: bytes,
    omniparser_url: str,
    timeout: float,
    confidence_threshold: float,
) -> OmniParserResult | None:
    """Execute a single OmniParser HTTP request."""
    image_b64 = base64.b64encode(img_bytes).decode("utf-8")
    url = omniparser_url.rstrip("/") + "/parse/"

    headers: dict[str, str] = {"Content-Type": "application/json"}
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
    except httpx.HTTPStatusError as e:
        logger.warning("OmniParser HTTP %d: %s", e.response.status_code, e.response.text[:200])
        return None
    except Exception as e:
        logger.warning("OmniParser request failed: %s", e)
        return None

    elapsed = time.monotonic() - start
    parsed_content_list = data.get("parsed_content_list", [])
    screen_info = _build_screen_info(parsed_content_list, confidence_threshold)
    som_image_base64 = data.get("som_image_base64", "")
    server_latency = data.get("latency", 0.0)

    result = OmniParserResult(
        parsed_content_list=parsed_content_list,
        screen_info=screen_info,
        som_image_base64=som_image_base64,
        latency=server_latency,
    )

    filtered_count = screen_info.count("\n") + (1 if screen_info else 0)
    logger.info(
        "OmniParser: %d raw elements, %d after filtering (conf>=%.2f, area>=%.4f, max=%d) in %.2fs (server: %.2fs)",
        len(parsed_content_list),
        filtered_count,
        confidence_threshold,
        _MIN_ELEMENT_AREA,
        _MAX_ELEMENTS_FOR_PROMPT,
        elapsed,
        server_latency,
    )

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
