"""
Composio SDK wrapper: execute tools for the signed-in user's Firebase **uid** as Composio ``user_id``.

Per Composio multi-tenant guidance, ``user_id`` must be your app's stable user key — Echo uses the
Firebase Authentication uid everywhere (agent, backend, connect links).
"""

from __future__ import annotations

import asyncio
import logging
import os
from functools import lru_cache
from typing import Any

from echo_prism_agent.composio_integration.connect_links import enrich_auth_failure
from echo_prism_agent.composio_integration.langfuse_tracing import composio_span

logger = logging.getLogger(__name__)


def _error_suggests_auth_hint(err: Any) -> bool:
    err_s = str(err or "").lower()
    return any(
        x in err_s
        for x in (
            "connect",
            "auth",
            "account",
            "401",
            "403",
            "unauthorized",
            "forbidden",
            "not connected",
            "reconnect",
        )
    )


@lru_cache(maxsize=1)
def _composio_client():
    key = (os.getenv("COMPOSIO_API_KEY") or "").strip()
    if not key:
        return None
    try:
        from composio import Composio

        return Composio(api_key=key)
    except Exception as e:
        logger.warning("Composio client init failed: %s", e)
        return None


def composio_configured() -> bool:
    return _composio_client() is not None


def _dangerously_skip_toolkit_version_check() -> bool:
    """
    Composio requires a concrete toolkit version for manual execute(), or this flag when using
    implicit \"latest\". Default on so api_call works without COMPOSIO_TOOLKIT_VERSION_* per toolkit.
    Set COMPOSIO_DANGEROUSLY_SKIP_TOOLKIT_VERSION_CHECK=0 to require pinned versions via env/SDK.
    """
    v = (os.getenv("COMPOSIO_DANGEROUSLY_SKIP_TOOLKIT_VERSION_CHECK") or "1").strip().lower()
    return v not in ("0", "false", "no")


def execute_composio_tool_sync(uid: str, slug: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """
    Execute a Composio tool synchronously (call via asyncio.to_thread from async code).

    Returns a JSON-serializable dict: { successful, data?, error? }.
    """
    c = _composio_client()
    if not c:
        return {"successful": False, "error": "COMPOSIO_API_KEY not configured", "data": {}}

    try:
        resp = c.tools.execute(
            slug,
            dict(arguments or {}),
            user_id=uid,
            dangerously_skip_version_check=_dangerously_skip_toolkit_version_check(),
        )
        # ToolExecutionResponse: successful, data, error
        out: dict[str, Any] = {
            "successful": bool(resp.get("successful")),
            "data": resp.get("data") or {},
            "error": resp.get("error"),
        }
        if not out["successful"] and _error_suggests_auth_hint(out.get("error")):
            out["composio_auth_hint"] = True
            enrich_auth_failure(uid, slug, out)
        return out
    except Exception as e:
        logger.exception("Composio execute failed slug=%s", slug)
        err_s = str(e)
        out = {"successful": False, "data": {}, "error": err_s}
        if _error_suggests_auth_hint(err_s):
            out["composio_auth_hint"] = True
            enrich_auth_failure(uid, slug, out)
        return out


async def execute_composio_tool(uid: str, slug: str, arguments: dict[str, Any]) -> dict[str, Any]:
    with composio_span(uid=uid, slug=slug, hitl=None):
        return await asyncio.to_thread(execute_composio_tool_sync, uid, slug, arguments)
