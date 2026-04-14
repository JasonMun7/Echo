"""Map Composio SDK-style results to Echo chat tool payloads (WebSocket / function responses)."""

from __future__ import annotations

from typing import Any


def merge_composio_execute_result(out: dict[str, Any]) -> dict[str, Any]:
    """Map Composio SDK dict (``successful``, ``connect_url``, …) to chat ``ok`` payload."""
    if out.get("successful"):
        return {"ok": True, "result": {"data": out.get("data"), "composio": True}}
    err: dict[str, Any] = {"ok": False, "error": out.get("error") or "Composio execution failed"}
    if out.get("composio_auth_hint"):
        err["composio_auth_hint"] = True
    if out.get("connect_url"):
        err["connect_url"] = out["connect_url"]
    if out.get("toolkit"):
        err["toolkit"] = out["toolkit"]
    return err
