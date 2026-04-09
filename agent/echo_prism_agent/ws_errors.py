"""
WebSocket error taxonomy for agent ↔ desktop (ECHO_* codes).

Used in ``routers/agent.py`` so clients can classify failures (auth, guard, inference, etc.).
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
GUARD_BLOCKED = "ECHO_GUARD_BLOCKED"
UNKNOWN = "ECHO_UNKNOWN"


def ws_error(message: str, code: str | None = None) -> dict:
    """
    Create a JSON-serializable WebSocket error payload for agent↔desktop communication.
    
    Parameters:
        message (str): Human-readable error message to send to the client.
        code (str | None): Optional stable ECHO_* error code to classify the error.
    
    Returns:
        dict: A dictionary containing "type" set to "error", the provided "message", and the optional "code" when given.
    """
    out: dict = {"type": "error", "message": message}
    if code:
        out["code"] = code
    return out


def classify_api_call_error(message: str) -> str:
    """
    Classifies a connector/API error message into one of the module's `ECHO_*` error codes.
    
    Chooses `GUARD_BLOCKED` when the message indicates a Gmail send was blocked (e.g., contains "gmail_send blocked" or "blocked:" together with "gmail"); chooses `INTEGRATION` when the message indicates connectivity or authorization problems (e.g., "not connected", "missing_access_token") or when it mentions a user reject; defaults to `INTEGRATION` for any other message.
    
    Returns:
        str: One of the `ECHO_*` codes (e.g., `GUARD_BLOCKED`, `INTEGRATION`).
    """
    m = (message or "").lower()
    if "gmail_send blocked" in m or "blocked:" in m and "gmail" in m:
        return GUARD_BLOCKED
    if "not connected" in m or "missing_access_token" in m:
        return INTEGRATION
    if "reject" in m and "user" in m:
        return INTEGRATION
    return INTEGRATION
