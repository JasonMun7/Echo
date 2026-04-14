"""Danger heuristic for Composio slugs."""

from echo_prism_agent.composio_integration.danger import is_dangerous_composio_slug


def test_slack_send_is_dangerous() -> None:
    assert is_dangerous_composio_slug("SLACK_SEND_MESSAGE") is True


def test_slack_list_is_safe() -> None:
    assert is_dangerous_composio_slug("SLACK_LIST_ALL_CHANNELS") is False


def test_meta_tool_slugs_not_dangerous() -> None:
    assert is_dangerous_composio_slug("COMPOSIO_MULTI_EXECUTE_TOOL") is False
