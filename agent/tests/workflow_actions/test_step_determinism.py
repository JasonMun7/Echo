"""
Workflow action names from the editor (browser ∪ desktop) vs `is_deterministic` / `step_to_action`.

Keeps parity with `apps/desktop/.../direct-executor.ts` (run desktop tests alongside).
"""

from __future__ import annotations

import pytest
from echo_prism_agent.execution.operator import is_deterministic, step_to_action


def _step(action: str, params: dict | None = None) -> dict:
    return {"action": action, "params": params or {}}


@pytest.mark.parametrize(
    ("action", "params", "expect_deterministic"),
    [
        # Deterministic when params satisfy operator rules
        ("api_call", {"integration": "x", "method": "m", "args": {}}, True),
        ("navigate", {"url": "https://example.com"}, True),
        ("navigate", {}, False),
        ("wait", {}, True),
        ("press_key", {"key": "Enter"}, True),
        ("press_key", {}, False),
        ("hotkey", {"keys": ["a"]}, True),
        ("hotkey", {}, True),
        ("scroll", {"direction": "down"}, True),
        ("scroll", {}, False),
        ("open_app", {"appName": "Notes"}, True),
        ("open_app", {}, False),
        ("focus_app", {"appName": "Notes"}, True),
        ("focus_app", {}, False),
        ("select_option", {"selector": "#s", "value": "1"}, True),
        ("select_option", {"selector": "#s"}, False),
        ("select_option", {"value": "1"}, False),
        ("wait_for_element", {"selector": "body"}, True),
        ("wait_for_element", {}, False),
        (
            "type_text_at",
            {"text": "hi", "x": 10, "y": 20},
            True,
        ),
        ("type_text_at", {"text": "hi"}, False),
        ("type_text_at", {"x": 1, "y": 2}, False),
        # Pointer / vision-only (no deterministic rule in operator)
        ("click_at", {"description": "x"}, False),
        ("right_click", {}, False),
        ("double_click", {}, False),
        ("hover", {}, False),
        ("drag", {}, False),
        ("drag_drop", {}, False),
        ("take_screenshot", {}, False),
        ("open_web_browser", {}, False),
        ("close_web_browser", {}, False),
    ],
)
def test_is_deterministic_matrix(action: str, params: dict, expect_deterministic: bool) -> None:
    assert is_deterministic(_step(action, params)) is expect_deterministic


def test_step_to_action_navigate_and_press_key() -> None:
    n = step_to_action(_step("navigate", {"url": "https://a.com"}))
    assert n["action"] == "navigate"
    assert n["url"] == "https://a.com"

    p = step_to_action(_step("press_key", {"key": "Tab"}))
    assert p["action"] == "presskey"
    assert p["key"] == "Tab"


def test_step_to_action_click_at_maps_to_click() -> None:
    c = step_to_action(_step("click_at", {"x": 100, "y": 200}))
    assert c["action"] == "click"
    assert c["x"] == 100
    assert c["y"] == 200


def test_step_to_action_scroll_open_focus_select() -> None:
    s = step_to_action(_step("scroll", {"direction": "up", "amount": 400}))
    assert s["action"] == "scroll"
    assert s["direction"] == "up"
    assert s["distance"] == 400

    o = step_to_action(_step("open_app", {"appName": "Calc"}))
    assert o["action"] == "openapp"

    f = step_to_action(_step("focus_app", {"appName": "Calc"}))
    assert f["action"] == "focusapp"

    sel = step_to_action(_step("select_option", {"selector": "#m", "value": "v"}))
    assert sel["action"] == "selectoption"
    assert sel["selector"] == "#m"
    assert sel["value"] == "v"


def test_step_to_action_api_call() -> None:
    a = step_to_action(
        _step(
            "api_call",
            {"integration": "slack", "method": "post", "args": {"c": 1}},
        )
    )
    assert a["action"] == "apicall"
    assert a["integration"] == "slack"
    assert a["method"] == "post"
    assert a["args"] == {"c": 1}


def test_step_to_action_unknown_action_passes_through_normalized_name() -> None:
    # e.g. take_screenshot — not special-cased; used for VLM / future operator routing
    t = step_to_action(_step("take_screenshot", {}))
    assert t["action"] == "takescreenshot"
