"""WebSocket error code helpers."""

from echo_prism_agent.ws_errors import (
    INTEGRATION,
    classify_api_call_error,
)


def test_classify_integration_token() -> None:
    assert classify_api_call_error("missing_access_token") == INTEGRATION
