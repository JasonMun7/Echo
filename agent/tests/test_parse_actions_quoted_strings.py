"""Regression: quoted string args must respect backslash escapes (e.g. I\'m)."""

from echo_prism_agent.ui_tars.parse_actions import parse_action


def test_type_named_content_escaped_apostrophe_single_quoted() -> None:
    out = parse_action("Action: type(content='I\\'m just testing something')")
    assert out is not None
    assert out["action"] == "type"
    assert out["content"] == "I'm just testing something"


def test_type_positional_escaped_apostrophe() -> None:
    out = parse_action("Action: type('I\\'m here')")
    assert out is not None
    assert out["content"] == "I'm here"


def test_type_double_quoted_inner_apostrophe_no_escape() -> None:
    out = parse_action('Action: type(content="I\'m fine")')
    assert out is not None
    assert out["content"] == "I'm fine"


def test_clickandtype_last_arg_escaped_apostrophe() -> None:
    out = parse_action("Action: ClickAndType(500, 300, 'I\\'m here')")
    assert out is not None
    assert out["action"] == "clickandtype"
    assert out["x"] == 500
    assert out["y"] == 300
    assert out["content"] == "I'm here"


def test_clickandtype_only_quoted_arg() -> None:
    out = parse_action("Action: ClickAndType('I\\'m only')")
    assert out is not None
    assert out["content"] == "I'm only"
