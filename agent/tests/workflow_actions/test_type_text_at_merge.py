"""type_text_at: determinism, merge with VLM output, parity with desktop."""

from echo_prism_agent.execution.operator import (
    is_deterministic,
    merge_type_text_at_workflow_literal,
    step_to_action,
)


def test_typetextat_grounded_is_deterministic():
    step = {
        "action": "type_text_at",
        "params": {"text": "hello", "x": 100, "y": 200},
    }
    assert is_deterministic(step) is True
    d = step_to_action(step)
    assert d["action"] == "clickandtype"
    assert d["content"] == "hello"
    assert d["x"] == 100
    assert d["y"] == 200


def test_typetextat_no_coords_not_deterministic():
    step = {"action": "type_text_at", "params": {"text": "hello"}}
    assert is_deterministic(step) is False
    d = step_to_action(step)
    assert d["action"] == "type"
    assert d["content"] == "hello"


def test_merge_typetextat_click_to_clickandtype():
    step = {
        "action": "type_text_at",
        "params": {"text": "hello world", "description": "box"},
    }
    parsed = {"action": "click", "x": 100, "y": 200}
    out = merge_type_text_at_workflow_literal(step, parsed)
    assert out["action"] == "clickandtype"
    assert out["x"] == 100
    assert out["y"] == 200
    assert out["content"] == "hello world"
    assert out["distance"] == 800


def test_merge_typetextat_overrides_type_content():
    step = {"action": "type_text_at", "params": {"text": "literal"}}
    parsed = {"action": "type", "content": "wrong"}
    out = merge_type_text_at_workflow_literal(step, parsed)
    assert out["content"] == "literal"


def test_merge_typetextat_skips_when_workflow_grounded():
    step = {
        "action": "type_text_at",
        "params": {"text": "x", "x": 1, "y": 2},
    }
    parsed = {"action": "click", "x": 9, "y": 9}
    out = merge_type_text_at_workflow_literal(step, parsed)
    assert out == parsed


def test_merge_typetextat_typing_override():
    step = {"action": "type_text_at", "params": {"text": "old"}}
    parsed = {"action": "click", "x": 1, "y": 2}
    out = merge_type_text_at_workflow_literal(step, parsed, typing_override="secret")
    assert out["content"] == "secret"
