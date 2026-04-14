"""
Composio Tool Router session (v3) + LangGraph provider — used for chat tool declarations and execution.

**User ID (Composio ``user_id``):** Always the Firebase Authentication **uid** for the signed-in user.
That uid is the stable, per-tenant identifier Composio uses for connected accounts and isolation
(see Composio skill ``tr-userid-best-practices`` — never ``default`` or email as ``user_id``).

**Session lifecycle:** We cache Tool Router sessions keyed by ``(uid, connection_id)`` so concurrent
chats for the same user do not share session state. Callers pass a per-WebSocket ``connection_id``
(text chat: one UUID per connection; voice: stable id per Live session). The cache entry is removed
when the connection ends or when a tool result indicates OAuth may be needed
(``composio_auth_hint``), so the next session create picks up fresh connection state.
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
_key_locks_guard = threading.Lock()
# Per (uid, connection_id) lock so two connections don't serialize on c.create(), and we never
# hold _session_lock during network I/O.
_key_locks: dict[tuple[str, str], threading.Lock] = {}
# (uid, connection_id) -> (session object, wrapped LC tools list)
_session_cache: dict[tuple[str, str], tuple[Any, list[Any]]] = {}


def _lock_for_cache_key(key: tuple[str, str]) -> threading.Lock:
    with _key_locks_guard:
        if key not in _key_locks:
            _key_locks[key] = threading.Lock()
        return _key_locks[key]


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


def _pop_key_locks_for_keys(keys: list[tuple[str, str]]) -> None:
    """Remove per-key locks when cache entries are evicted (avoid unbounded _key_locks growth)."""
    if not keys:
        return
    with _key_locks_guard:
        for k in keys:
            _key_locks.pop(k, None)


def clear_chat_session_cache(uid: str | None = None, connection_id: str | None = None) -> None:
    """Drop cached Tool Router sessions so the next ``create()`` sees latest Composio connection state."""
    global _session_cache
    removed_keys: list[tuple[str, str]] = []
    with _session_lock:
        if uid is None and connection_id is None:
            removed_keys = list(_session_cache.keys())
            _session_cache.clear()
        elif uid is not None and connection_id is not None:
            k = (uid, connection_id)
            if _session_cache.pop(k, None) is not None:
                removed_keys = [k]
        elif uid is not None:
            drop = [k for k in _session_cache if k[0] == uid]
            for k in drop:
                _session_cache.pop(k, None)
            removed_keys = drop
        else:
            drop = [k for k in _session_cache if k[1] == connection_id]
            for k in drop:
                _session_cache.pop(k, None)
            removed_keys = drop
    _pop_key_locks_for_keys(removed_keys)


def invalidate_chat_session_if_auth_hint(uid: str, connection_id: str, tool_payload: dict[str, Any]) -> None:
    """After a failed Composio call that hints OAuth, discard the cached session for this connection."""
    if tool_payload.get("composio_auth_hint"):
        clear_chat_session_cache(uid, connection_id)


def get_or_create_chat_router_session(uid: str, connection_id: str) -> tuple[Any | None, list[Any]]:
    """
    Return ``(ToolRouterSession | None, langchain_tools)`` for this user and connection.

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

    cid = (connection_id or "").strip() or "default"
    key = (uid, cid)

    with _session_lock:
        if key in _session_cache:
            return _session_cache[key]

    key_lock = _lock_for_cache_key(key)
    with key_lock:
        with _session_lock:
            if key in _session_cache:
                return _session_cache[key]
        try:
            sess = c.create(user_id=uid, toolkits=_toolkits_from_env())
            tools = sess.tools()
        except Exception as e:
            logger.warning("Composio tool router session create failed uid=%s: %s", uid[:8], e)
            return None, []

        with _session_lock:
            if key in _session_cache:
                return _session_cache[key]
            _session_cache[key] = (sess, tools)
            return sess, tools


async def invoke_composio_meta_tool(
    uid: str, name: str, arguments: dict[str, Any], *, connection_id: str
) -> dict[str, Any]:
    """Execute a Composio meta-tool (e.g. ``COMPOSIO_MULTI_EXECUTE_TOOL``) via the LangGraph-wrapped tool."""
    from echo_prism_agent.composio_integration.langfuse_tracing import composio_span

    _sess, tools = get_or_create_chat_router_session(uid, connection_id)
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
