"""Coordinate helpers — UI-TARS-desktop ``actionParser`` parity (V1.5 VLM canvas → operator 0–1000)."""

from __future__ import annotations

import logging
import os
from typing import Any

from echo_prism_agent.constants import NORM_COORD_SCALE, effective_ui_tars_model_id

logger = logging.getLogger(__name__)


def use_vlm_pixel_to_norm1000_mapping() -> bool:
    """
    When True, parsed x/y are **VLM image pixels** on the smart-resized canvas (wBar×hBar),
    matching UI-TARS-desktop + ``parseActionVlm`` for ``UITarsModelVersion.V1_5``.

    Set ``ECHOPRISM_UI_TARS_COORD_MODE=norm1000`` to keep legacy Echo behavior (coords already 0–1000).
    """
    mode = (os.environ.get("ECHOPRISM_UI_TARS_COORD_MODE") or "").strip().lower()
    if mode in ("norm1000", "legacy", "echo", "0", "false"):
        return False
    if mode in ("vlm_pixel", "v15", "desktop", "pixel", "1", "true"):
        return True
    mid = effective_ui_tars_model_id().lower()
    if "ui-tars-1.5" in mid or "ui-tars-1-5" in mid:
        return True
    return False


def _vlm_pixel_coords_to_norm_1000(
    parsed: dict[str, Any],
    vlm_width: int,
    vlm_height: int,
) -> dict[str, Any]:
    """Map VLM canvas pixels to 0–1000 for ``PlaywrightOperator._scale`` (same as desktop / 1000 factors)."""
    out = dict(parsed)
    if vlm_width <= 0 or vlm_height <= 0:
        return out

    def _map_one(keyx: str, keyy: str) -> None:
        if keyx not in out or keyy not in out or out[keyx] is None or out[keyy] is None:
            return
        try:
            rx = float(out[keyx])
            ry = float(out[keyy])
        except (TypeError, ValueError):
            return
        nx = max(0, min(NORM_COORD_SCALE, int(round((rx / float(vlm_width)) * NORM_COORD_SCALE))))
        ny = max(0, min(NORM_COORD_SCALE, int(round((ry / float(vlm_height)) * NORM_COORD_SCALE))))
        out[keyx], out[keyy] = nx, ny

    _map_one("x", "y")
    _map_one("x1", "y1")
    _map_one("x2", "y2")
    return out


def apply_post_inference_vlm_coords(
    parsed: dict[str, Any],
    *,
    vlm_w: int,
    vlm_h: int,
) -> dict[str, Any]:
    """After ``parse_action``, convert UI-TARS 1.5 VLM pixels → Echo operator scale (0–1000)."""
    if not parsed or not use_vlm_pixel_to_norm1000_mapping():
        return parsed
    if vlm_w <= 0 or vlm_h <= 0:
        logger.warning(
            "apply_post_inference_vlm_coords: missing vlm dimensions (%s×%s); skipping remap",
            vlm_w,
            vlm_h,
        )
        return parsed
    act = (parsed.get("action") or "").lower()
    if act not in (
        "click",
        "doubleclick",
        "rightclick",
        "hover",
        "hovertoread",
        "longpress",
        "scroll",
        "clickandtype",
        "drag",
        "selectoption",
    ):
        return parsed
    before = (parsed.get("x"), parsed.get("y"))
    out = _vlm_pixel_coords_to_norm_1000(parsed, vlm_w, vlm_h)
    if before != (out.get("x"), out.get("y")):
        logger.info(
            "VLM→norm1000 remap (%s×%s): %s → (%s, %s)",
            vlm_w,
            vlm_h,
            before,
            out.get("x"),
            out.get("y"),
        )
    return out


def remap_grounding_coords_for_vlm_canvas(
    parsed: dict[str, Any],
    vlm_width: int,
    vlm_height: int,
) -> dict[str, Any]:
    """When ``ECHOPRISM_V15_COORD_STYLE=pixel``, map VLM pixel coords to 0–1000 (tests / explicit opt-in)."""
    style = (os.environ.get("ECHOPRISM_V15_COORD_STYLE") or "").strip().lower()
    if style != "pixel" or vlm_width <= 0 or vlm_height <= 0:
        return dict(parsed)
    return _vlm_pixel_coords_to_norm_1000(dict(parsed), vlm_width, vlm_height)
