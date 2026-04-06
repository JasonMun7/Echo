"""Synthesis heuristics that reference workflow steps (typing sequence)."""

from echo_prism_agent.synthesis.pipeline import typing_sequence_warnings


def test_typing_sequence_warns_click_then_enter_without_type():
    steps = [
        {"action": "click_at", "params": {}},
        {"action": "press_key", "params": {"key": "Enter"}},
    ]
    w = typing_sequence_warnings(steps)
    assert len(w) == 1
    assert "type_text_at" in w[0]
