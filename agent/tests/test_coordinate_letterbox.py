"""CoordinateTransformer + letterbox margin helpers."""

from echo_prism_agent.ui_tars.parse_actions import CoordinateTransformer
from echo_prism_agent.ui_tars.screenshot_pipeline import centered_square_letterbox_margins


def test_coordinate_transformer_center_without_margins():
    t = CoordinateTransformer(1920, 1080)
    x, y = t.to_pixel(500, 500)
    assert x == 960
    assert y == 540


def test_centered_square_letterbox_margins_16_10():
    # 1920x1200 inside square 1920 — horizontal full, vertical letterbox
    l, top, r, bot = centered_square_letterbox_margins(1920, 1200, 1920)
    assert abs(l) < 1e-9 and abs(r) < 1e-9
    assert abs(top - 360 / 1920) < 1e-9 and abs(bot - 360 / 1920) < 1e-9


def test_transformer_with_margins_maps_center_to_screen_center():
    # Synthetic: 10% margin on left and right (pillarbox), content uses middle 80% width
    m = (0.1, 0.0, 0.1, 0.0)
    t = CoordinateTransformer(1000, 500, margin_ltrb=m)
    # VLM (500,500) is center of full canvas → center of content strip → full screen center
    x, y = t.to_pixel(500, 500)
    assert x == 500
    assert y == 250
