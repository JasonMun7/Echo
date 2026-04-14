"""Composio connect link helpers."""

from echo_prism_agent.composio_integration.connect_links import (
    enrich_auth_failure,
    infer_toolkit_from_composio_slug,
)


def test_infer_toolkit_from_slug() -> None:
    assert infer_toolkit_from_composio_slug("GMAIL_SEND_EMAIL") == "gmail"
    assert infer_toolkit_from_composio_slug("SLACK_LIST_ALL_CHANNELS") == "slack"
    assert infer_toolkit_from_composio_slug("COMPOSIO_MULTI_EXECUTE_TOOL") == ""


def test_enrich_auth_failure_adds_toolkit() -> None:
    p = {"successful": False, "composio_auth_hint": True, "error": "x"}
    original = dict(p)
    out = enrich_auth_failure("u1", "GITHUB_LIST_REPOS", p)
    assert p == original
    assert out.get("toolkit") == "github"
