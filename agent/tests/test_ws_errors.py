"""WebSocket error code helpers."""

from echo_prism_agent.ws_errors import (
    GUARD_BLOCKED,
    INTEGRATION,
    classify_api_call_error,
)


def test_classify_guard_blocked() -> None:
    assert (
        classify_api_call_error("gmail_send blocked: the message body still looks like")
        == GUARD_BLOCKED
    )


def test_classify_integration_token() -> None:
    assert classify_api_call_error("missing_access_token") == INTEGRATION
