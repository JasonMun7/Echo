"""Tests for synthesis pipeline _postprocess_steps."""

from echo_prism_agent.synthesis.pipeline import _postprocess_steps


def test_postprocess_strips_coordinate_keys():
    raw = [
        {
            "action": "click_at",
            "context": "c",
            "params": {"x": 100, "y": 200, "description": "btn"},
            "expected_outcome": "e",
        }
    ]
    out, vars_ = _postprocess_steps(raw)
    assert len(out) == 1
    assert "x" not in out[0]["params"]
    assert "y" not in out[0]["params"]
    assert out[0]["params"]["description"] == "btn"


def test_postprocess_no_default_coords():
    """No synthetic 500 coords — only stripping."""
    steps, _ = _postprocess_steps(
        [{"action": "click_at", "context": "", "params": {"description": "x"}, "expected_outcome": ""}]
    )
    assert "x" not in steps[0]["params"]


def test_postprocess_extracts_variables():
    steps, vars_ = _postprocess_steps(
        [
            {
                "action": "type_text_at",
                "context": "c",
                "params": {"text": "{{email}}", "description": "field"},
                "expected_outcome": "",
            }
        ]
    )
    assert "email" in vars_


def test_postprocess_dedupes_identical_consecutive():
    a = {"action": "wait", "context": "", "params": {"seconds": 1}, "expected_outcome": ""}
    steps, _ = _postprocess_steps([a, dict(a)])
    assert len(steps) == 1
