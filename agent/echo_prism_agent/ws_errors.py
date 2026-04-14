"""
WebSocket error taxonomy for agent ↔ desktop (ECHO_* codes).

Used in ``routers/agent.py`` so clients can classify failures (auth, integration, inference, etc.).
"""

from __future__ import annotations

# --- Codes (stable string identifiers) ---
INVALID_INPUT = "ECHO_INVALID_INPUT"
RUN_ACCESS = "ECHO_RUN_ACCESS"
CONFIG = "ECHO_CONFIG"
PENDING_INTERRUPT = "ECHO_PENDING_INTERRUPT"
RESUME = "ECHO_RESUME"
INFERENCE = "ECHO_INFERENCE"
VERIFY = "ECHO_VERIFY"
INTEGRATION = "ECHO_INTEGRATION"
UNKNOWN = "ECHO_UNKNOWN"


def ws_error(message: str, code: str | None = None) -> dict:
    """JSON message for ``type: error`` over the agent run WebSocket."""
    out: dict = {"type": "error", "message": message}
    if code:
        out["code"] = code
    return out


def classify_api_call_error(message: str) -> str:
    """Map connector / execute_api_call strings to ECHO_* codes."""
    m = (message or "").lower()
    if "not connected" in m or "missing_access_token" in m:
        return INTEGRATION
    if "reject" in m and "user" in m:
        return INTEGRATION
    return INTEGRATION
