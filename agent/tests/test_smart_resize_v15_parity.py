"""
Parity with UI-TARS-desktop ``smartResizeForV15`` (actionParser.ts).

Reference dimensions were cross-checked with the same algorithm in Node.
"""

import pytest

from echo_prism_agent.constants import MAX_PIXELS_UI_TARS_1_5, MIN_PIXELS, RESIZE_FACTOR
from echo_prism_agent.ui_tars.screenshot_pipeline import smart_resize_for_v15


@pytest.mark.parametrize(
    ("width", "height", "expected"),
    [
        (1920, 1080, (1932, 1092)),
        (3440, 1440, (3444, 1428)),
        (1080, 1920, (1092, 1932)),
        (5000, 1000, (5012, 1008)),
        (100, 100, (280, 280)),
    ],
)
def test_smart_resize_matches_ui_tars_desktop_v15(
    width: int, height: int, expected: tuple[int, int]
) -> None:
    out = smart_resize_for_v15(
        width, height, max_pixels=MAX_PIXELS_UI_TARS_1_5, min_pixels=MIN_PIXELS
    )
    assert out == expected


def test_extreme_aspect_ratio_returns_none() -> None:
    assert smart_resize_for_v15(50000, 100, max_pixels=MAX_PIXELS_UI_TARS_1_5) is None


def test_remap_matches_raw_over_vlm_dims(monkeypatch: pytest.MonkeyPatch) -> None:
    """Same normalization as parseActionVlm: raw_xy / wBar * DEFAULT_FACTOR (1000)."""
    monkeypatch.setenv("ECHOPRISM_V15_COORD_STYLE", "pixel")
    monkeypatch.setenv("UI_TARS_MODEL_ID", "bytedance/ui-tars-1.5-7b")
    from echo_prism_agent.ui_tars.coords import remap_grounding_coords_for_vlm_canvas

    w_bar, h_bar = smart_resize_for_v15(
        1920, 1080, max_pixels=MAX_PIXELS_UI_TARS_1_5
    ) or (0, 0)
    assert w_bar == 1932 and h_bar == 1092
    raw_x, raw_y = 966, 546
    parsed = {"action": "click", "x": raw_x, "y": raw_y}
    out = remap_grounding_coords_for_vlm_canvas(parsed, w_bar, h_bar)
    assert out["x"] == int(round((raw_x / w_bar) * 1000))
    assert out["y"] == int(round((raw_y / h_bar) * 1000))


def test_factor_is_resize_factor_multiple() -> None:
    out = smart_resize_for_v15(1920, 1080, max_pixels=MAX_PIXELS_UI_TARS_1_5)
    assert out is not None
    w, h = out
    assert w % RESIZE_FACTOR == 0 and h % RESIZE_FACTOR == 0


def test_effective_model_defaults_match_openrouter_for_coord_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Unset UI_TARS_MODEL_ID must still imply 1.5 (same as OpenRouter default)."""
    monkeypatch.delenv("UI_TARS_MODEL_ID", raising=False)
    monkeypatch.delenv("ECHOPRISM_INFERENCE_MODEL", raising=False)
    from echo_prism_agent.constants import effective_ui_tars_model_id
    from echo_prism_agent.ui_tars.coords import use_vlm_pixel_to_norm1000_mapping

    assert "ui-tars-1.5" in effective_ui_tars_model_id().lower()
    assert use_vlm_pixel_to_norm1000_mapping() is True


def test_apply_post_inference_vlm_pixels_to_norm1000(monkeypatch: pytest.MonkeyPatch) -> None:
    """UI-TARS 1.5 outputs coords on the resized image; Echo maps to 0–1000 for operators."""
    monkeypatch.setenv("ECHOPRISM_UI_TARS_COORD_MODE", "vlm_pixel")
    from echo_prism_agent.ui_tars.coords import apply_post_inference_vlm_coords

    w_bar, h_bar = 1932, 1092
    parsed = {"action": "click", "x": 838, "y": 326}
    out = apply_post_inference_vlm_coords(parsed, vlm_w=w_bar, vlm_h=h_bar)
    assert out["x"] == int(round((838 / w_bar) * 1000))
    assert out["y"] == int(round((326 / h_bar) * 1000))
