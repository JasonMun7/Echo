"""
Composio Tool Router session (v3) + LangGraph provider — used for chat tool declarations and execution.

**User ID (Composio ``user_id``):** Always the Firebase Authentication **uid** for the signed-in user.
That uid is the stable, per-tenant identifier Composio uses for connected accounts and isolation
(see Composio skill ``tr-userid-best-practices`` — never ``default`` or email as ``user_id``).

**Session lifecycle:** We cache one Tool Router session per uid **within a single WebSocket text-chat
connection** — the cache is cleared when the chat connection starts and when a tool result indicates
the user may need to complete OAuth (``composio_auth_hint``), so the next turn picks up fresh
connection state (see ``tr-session-lifecycle`` / per-conversation session pattern).
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from functools import lru_cache
from typing import Any

logger = logging.getLogger(__name__)

_session_lock = threading.Lock()
# uid -> (session object, wrapped LC tools list)
_session_cache: dict[str, tuple[Any, list[Any]]] = {}


def _toolkits_from_env() -> list[str]:
    raw = (os.getenv("COMPOSIO_CHAT_TOOLKITS") or "slack,github,googlecalendar").strip()
    return [t.strip().lower().replace(" ", "") for t in raw.split(",") if t.strip()]


@lru_cache(maxsize=1)
def _composio_langgraph_client() -> Any | None:
    key = (os.getenv("COMPOSIO_API_KEY") or "").strip()
    if not key:
        return None
    try:
        from composio import Composio
        from composio_langgraph import LanggraphProvider

        return Composio(api_key=key, provider=LanggraphProvider())
    except Exception as e:
        logger.warning("Composio LangGraph client init failed: %s", e)
        return None


def clear_chat_session_cache(uid: str | None = None) -> None:
    """Drop cached Tool Router sessions so the next ``create()`` sees latest Composio connection state."""
    global _session_cache
    with _session_lock:
        if uid is None:
            _session_cache.clear()
        elif uid in _session_cache:
            del _session_cache[uid]


def invalidate_chat_session_if_auth_hint(uid: str, tool_payload: dict[str, Any]) -> None:
    """After a failed Composio call that hints OAuth, discard the cached session for this uid."""
    if tool_payload.get("composio_auth_hint"):
        clear_chat_session_cache(uid)


def get_or_create_chat_router_session(uid: str) -> tuple[Any | None, list[Any]]:
    """
    Return ``(ToolRouterSession | None, langchain_tools)`` for this user.

    On failure (no API key, network error), returns ``(None, [])``.
    """
    if not (uid or "").strip():
        return None, []

    if (os.getenv("COMPOSIO_DISABLE_CHAT_SESSION") or "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        return None, []

    c = _composio_langgraph_client()
    if not c:
        return None, []

    with _session_lock:
        if uid in _session_cache:
            return _session_cache[uid]
        try:
            sess = c.create(user_id=uid, toolkits=_toolkits_from_env())
            tools = sess.tools()
            _session_cache[uid] = (sess, tools)
            return sess, tools
        except Exception as e:
            logger.warning("Composio tool router session create failed uid=%s: %s", uid[:8], e)
            return None, []


async def invoke_composio_meta_tool(uid: str, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Execute a Composio meta-tool (e.g. ``COMPOSIO_MULTI_EXECUTE_TOOL``) via the LangGraph-wrapped tool."""
    from echo_prism_agent.composio_integration.langfuse_tracing import composio_span

    _sess, tools = get_or_create_chat_router_session(uid)
    if not tools:
        return {"successful": False, "error": "Composio session tools unavailable", "data": {}}

    target = None
    for t in tools:
        if getattr(t, "name", None) == name:
            target = t
            break
    if target is None:
        return {"successful": False, "error": f"Unknown Composio meta-tool: {name}", "data": {}}

    def _run() -> Any:
        return target.invoke(dict(arguments or {}))

    try:
        with composio_span(uid=uid, slug=name, hitl=None):
            out = await asyncio.to_thread(_run)
        if isinstance(out, dict):
            return out
        return {"successful": True, "data": out, "error": None}
    except Exception as e:
        logger.exception("Composio meta-tool invoke failed name=%s", name)
        return {"successful": False, "error": str(e), "data": {}}
