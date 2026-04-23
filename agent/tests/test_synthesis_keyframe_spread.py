"""Tests for spread_collapsed_synthesis_keyframes (synthesis router post-pass)."""

from echo_prism_agent.synthesis.pipeline import spread_collapsed_synthesis_keyframes


def _click_step(url: str) -> dict:
    return {
        "action": "click_at",
        "context": "x",
        "params": {"description": "btn"},
        "expected_outcome": "",
        "context_attachments": [
            {
                "id": "a1",
                "kind": "image",
                "name": "Step capture",
                "url": url,
                "ref_label": "c1",
            }
        ],
    }


def test_spread_when_all_visual_steps_share_image_0():
    steps = [_click_step("image_0.png"), _click_step("image_0.png"), _click_step("image_0.png")]
    spread_collapsed_synthesis_keyframes(steps, hi=5)
    urls = [s["context_attachments"][0]["url"] for s in steps]
    assert len(set(urls)) == 3
    assert all(u.startswith("image_") and u.endswith(".png") for u in urls)


def test_spread_no_op_when_hi_below_two_keyframes():
    steps = [_click_step("image_0.png"), _click_step("image_0.png")]
    spread_collapsed_synthesis_keyframes(steps, hi=0)
    assert steps[0]["context_attachments"][0]["url"] == "image_0.png"
    assert steps[1]["context_attachments"][0]["url"] == "image_0.png"


def test_skip_rewrite_when_model_used_distinct_indices():
    steps = [_click_step("image_0.png"), _click_step("image_2.png"), _click_step("image_1.png")]
    spread_collapsed_synthesis_keyframes(steps, hi=5)
    assert steps[0]["context_attachments"][0]["url"] == "image_0.png"
    assert steps[1]["context_attachments"][0]["url"] == "image_2.png"
    assert steps[2]["context_attachments"][0]["url"] == "image_1.png"


def test_non_visual_steps_unchanged():
    steps = [
        _click_step("image_0.png"),
        {
            "action": "navigate",
            "context": "",
            "params": {"url": "https://example.com", "description": "d"},
            "expected_outcome": "",
            "context_attachments": [{"id": "x", "kind": "image", "name": "m", "url": "image_0.png"}],
        },
    ]
    spread_collapsed_synthesis_keyframes(steps, hi=4)
    assert steps[1]["context_attachments"][0]["url"] == "image_0.png"


def test_backfill_missing_keyframe_on_visual_step():
    steps = [
        {
            "action": "scroll",
            "context": "sc",
            "params": {"direction": "down", "distance": 200, "description": "main"},
            "expected_outcome": "",
        },
        _click_step("image_0.png"),
    ]
    spread_collapsed_synthesis_keyframes(steps, hi=3)
    assert "context_attachments" in steps[0]
    assert any("image_" in str(a.get("url", "")) for a in steps[0]["context_attachments"] if isinstance(a, dict))


def test_scroll_is_visual_and_spreads_with_clicks():
    steps = [
        {
            "action": "scroll",
            "context": "",
            "params": {"direction": "down", "distance": 1, "description": "d"},
            "expected_outcome": "",
        },
        _click_step("image_0.png"),
        _click_step("image_0.png"),
    ]
    spread_collapsed_synthesis_keyframes(steps, hi=4)
    att0 = steps[0].get("context_attachments") or []
    assert att0 and "image_" in att0[0].get("url", "")
