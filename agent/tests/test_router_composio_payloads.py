"""Chat router Composio result mapping."""

from echo_prism_agent.composio_integration.chat_tool_payloads import merge_composio_execute_result


def test_merge_success() -> None:
    r = merge_composio_execute_result({"successful": True, "data": {"a": 1}})
    assert r["ok"] is True
    assert r["result"]["data"] == {"a": 1}


def test_merge_auth_hint() -> None:
    r = merge_composio_execute_result(
        {
            "successful": False,
            "error": "nope",
            "composio_auth_hint": True,
            "connect_url": "https://example.com/oauth",
            "toolkit": "slack",
        }
    )
    assert r["ok"] is False
    assert r["connect_url"] == "https://example.com/oauth"
    assert r["toolkit"] == "slack"
    assert r["composio_auth_hint"] is True
