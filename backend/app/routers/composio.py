"""
Composio: OAuth connect links (Managed Auth).

**User ID:** ``uid`` from Firebase ID token verification is passed to ``composio.create(user_id=…)``.
That is the canonical Composio ``user_id`` for this user — stable, unique, and never shared across users.
"""

from __future__ import annotations

import logging
import os
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_uid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/composio", tags=["composio"])


def _oauth_callback_url() -> str | None:
    """
    Return URL Composio redirects to after OAuth.

    If ``COMPOSIO_OAUTH_CALLBACK_URL`` is set, use it verbatim. Otherwise use
    ``{FRONTEND_ORIGIN}/dashboard/integrations`` (strip trailing slash on origin).
    """
    explicit = (os.getenv("COMPOSIO_OAUTH_CALLBACK_URL") or "").strip()
    if explicit:
        return explicit
    front = (os.getenv("FRONTEND_ORIGIN") or "").strip().rstrip("/")
    if not front:
        return None
    return f"{front}/dashboard/integrations"


def _normalize_toolkit(toolkit: str) -> str:
    return toolkit.strip().lower().replace(" ", "")


def _allowed_callback_scheme(scheme: str) -> bool:
    extra = (os.getenv("COMPOSIO_OAUTH_ALLOWED_CALLBACK_SCHEMES") or "exp").strip()
    allowed = {x.strip().lower() for x in extra.split(",") if x.strip()}
    return scheme.lower() in allowed


def _validated_client_callback_url(raw: str | None) -> str | None:
    """
    Optional redirect URL from the client.

    - ``https``/``http``: must match ``FRONTEND_ORIGIN`` host, except ``localhost`` / ``127.0.0.1`` (dev).
    - Native schemes (e.g. ``exp``): allowed when listed in ``COMPOSIO_OAUTH_ALLOWED_CALLBACK_SCHEMES``.
    """
    if not raw:
        return None
    s = raw.strip()
    if not s:
        return None
    try:
        p = urlparse(s)
    except Exception:
        return None
    scheme = (p.scheme or "").lower()
    host = (p.hostname or "").lower()

    if scheme in ("https", "http"):
        if host in ("localhost", "127.0.0.1"):
            return s
        front = (os.getenv("FRONTEND_ORIGIN") or "").strip()
        if not front:
            return None
        fp = urlparse(front if "://" in front else f"https://{front}")
        if p.netloc.lower() != fp.netloc.lower():
            return None
        return s

    if _allowed_callback_scheme(scheme):
        return s

    return None


def _toolkit_row_from_state(item: object) -> dict:
    """Map Composio ``ToolkitConnectionState`` to JSON (session.toolkits)."""
    conn = getattr(item, "connection", None)
    is_connected = bool(conn and getattr(conn, "is_active", False))
    ca = getattr(conn, "connected_account", None) if conn else None
    ca_id = getattr(ca, "id", None) if ca else None
    return {
        "slug": getattr(item, "slug", "") or "",
        "name": getattr(item, "name", "") or "",
        "logo": getattr(item, "logo", None),
        "is_no_auth": bool(getattr(item, "is_no_auth", False)),
        "is_connected": is_connected,
        "connected_account_id": ca_id if is_connected else None,
        "status_label": ca_id if is_connected else "Not connected",
    }


@router.get("/link")
async def composio_connect_link(
    toolkit: str = Query(
        ...,
        description="Composio toolkit id (slack, github, google, gmail, googledrive, googlecalendar, …)",
    ),
    callback_url: str | None = Query(
        None,
        description="Optional OAuth redirect URL; must match FRONTEND_ORIGIN host. Falls back to server default.",
    ),
    uid: str = Depends(get_current_uid),
):
    """Return a Composio OAuth redirect URL for the authenticated user (session.authorize pattern)."""
    key = (os.getenv("COMPOSIO_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="COMPOSIO_API_KEY not configured on API server")

    t = toolkit.strip().lower().replace(" ", "")
    if not t:
        raise HTTPException(status_code=400, detail="toolkit is required")

    from app.routers.integrations import (
        AVAILABLE_INTEGRATIONS,
        composio_raw_toolkit_slugs_accepted,
        echo_catalog_id_to_composio_toolkit,
    )

    if t in AVAILABLE_INTEGRATIONS:
        composio_t = echo_catalog_id_to_composio_toolkit(t)
    elif t in composio_raw_toolkit_slugs_accepted():
        composio_t = t
    else:
        raise HTTPException(status_code=400, detail=f"Unknown integration or toolkit: {t}")

    try:
        from composio import Composio

        c = Composio(api_key=key)
        session = c.create(user_id=uid, toolkits=[composio_t])
        cb = _validated_client_callback_url(callback_url) or _oauth_callback_url()
        req = session.authorize(composio_t, callback_url=cb)
        url = getattr(req, "redirect_url", None) or getattr(req, "redirectUrl", None)
        if not url:
            raise HTTPException(status_code=502, detail="Composio did not return a redirect URL")
        return {
            "url": url,
            "toolkit": t,
            "composio_toolkit": composio_t,
            "oauth_callback_url": cb,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("composio link failed: %s", e)
        raise HTTPException(status_code=502, detail="Upstream service error") from e


@router.get("/toolkits")
async def composio_toolkits_dashboard(uid: str = Depends(get_current_uid)):
    """
    Toolkit connection rows from ``session.toolkits()`` for the Echo catalog (managed OAuth status).
    """
    key = (os.getenv("COMPOSIO_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="COMPOSIO_API_KEY not configured on API server")
    from app.routers.integrations import composio_toolkits_for_session

    catalog = composio_toolkits_for_session()
    try:
        from composio import Composio

        c = Composio(api_key=key)
        session = c.create(user_id=uid, toolkits=catalog)
        resp = session.toolkits(toolkits=catalog, limit=50)
        rows = [_toolkit_row_from_state(item) for item in resp.items]
        return {
            "toolkits": rows,
            "oauth_callback_url": _oauth_callback_url(),
            "composio_configured": True,
        }
    except Exception as e:
        logger.exception("composio toolkits dashboard failed: %s", e)
        raise HTTPException(status_code=502, detail="Upstream service error") from e


@router.get("/toolkit-status")
async def composio_single_toolkit_status(
    toolkit: str = Query(..., description="Composio toolkit slug (e.g. gmail, slack)"),
    uid: str = Depends(get_current_uid),
):
    """
    Single-toolkit connection check via ``session.toolkits()`` — used by desktop Run HUD polling.
    """
    key = (os.getenv("COMPOSIO_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="COMPOSIO_API_KEY not configured on API server")
    t = _normalize_toolkit(toolkit)
    if not t:
        raise HTTPException(status_code=400, detail="toolkit is required")
    from app.routers.integrations import AVAILABLE_INTEGRATIONS, echo_catalog_id_to_composio_toolkit

    composio_t = _normalize_toolkit(
        echo_catalog_id_to_composio_toolkit(t) if t in AVAILABLE_INTEGRATIONS else t,
    )
    try:
        from composio import Composio

        c = Composio(api_key=key)
        session = c.create(user_id=uid, toolkits=[composio_t])
        resp = session.toolkits(toolkits=[composio_t], limit=10)
        for item in resp.items:
            if _normalize_toolkit(getattr(item, "slug", "") or "") != composio_t:
                continue
            row = _toolkit_row_from_state(item)
            return {
                "toolkit": t,
                "composio_toolkit": composio_t,
                "connected": row["is_connected"],
                "connected_account_id": row["connected_account_id"],
                "name": row["name"],
                "logo": row["logo"],
                "oauth_callback_url": _oauth_callback_url(),
            }
        return {
            "toolkit": t,
            "composio_toolkit": composio_t,
            "connected": False,
            "connected_account_id": None,
            "name": None,
            "logo": None,
            "oauth_callback_url": _oauth_callback_url(),
        }
    except Exception as e:
        logger.exception("composio toolkit-status failed: %s", e)
        raise HTTPException(status_code=502, detail="Upstream service error") from e


@router.get("/connection-status")
async def composio_connection_status(uid: str = Depends(get_current_uid)):
    """List ACTIVE Composio connected accounts for this user (toolkit slugs from Composio)."""
    key = (os.getenv("COMPOSIO_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="COMPOSIO_API_KEY not configured on API server")
    try:
        from composio import Composio

        c = Composio(api_key=key)
        resp = c.connected_accounts.list(user_ids=[uid], statuses=["ACTIVE"], limit=100)
        items = [
            {
                "toolkit": str(item.toolkit.slug).lower() if item.toolkit else "",
                "status": item.status,
                "id": item.id,
            }
            for item in resp.items
            if item.toolkit
        ]
        return {"accounts": items, "composio_configured": True}
    except Exception as e:
        logger.exception("composio connection-status failed: %s", e)
        raise HTTPException(status_code=502, detail="Upstream service error") from e


# Echo workflow editor app groups → Composio toolkit slug(s). Aligns with ``composio-app-groups`` / integrations.
_COMPOSIO_TOOLKITS_BY_APP_GROUP: dict[str, list[str]] = {
    "slack": ["slack"],
    "gmail": ["gmail"],
    "github": ["github"],
    # Google OAuth in Echo uses Composio googlecalendar for catalog; Drive is a separate toolkit.
    "google": ["googlecalendar", "googledrive"],
}


def _serialize_tool_item(item: object) -> dict:
    """Map Composio tool list item to JSON for the workflow editor."""
    slug = str(getattr(item, "slug", "") or "")
    name = str(getattr(item, "name", "") or slug)
    human = getattr(item, "human_description", None)
    desc = str(human or getattr(item, "description", "") or "")
    tk = getattr(item, "toolkit", None)
    toolkit_slug = str(getattr(tk, "slug", "") or "").lower() if tk else ""
    scopes = getattr(item, "scopes", None) or []
    scope_list = [str(s) for s in scopes] if isinstance(scopes, (list, tuple)) else []
    return {
        "slug": slug,
        "name": name,
        "description": desc.strip(),
        "toolkit_slug": toolkit_slug,
        "scopes": scope_list,
    }


@router.get("/toolkit-tools")
async def composio_toolkit_tools(
    app_group: str = Query(
        ...,
        description="Workflow editor bucket: slack | gmail | github | google",
    ),
    uid: str = Depends(get_current_uid),
):
    """
    List Composio tools for the toolkit(s) behind an Echo app group (full catalog from Composio, not the short static list).

    Used by the workflow ``api_call`` step editor so users can pick any tool after OAuth.
    """
    _ = uid
    key = (os.getenv("COMPOSIO_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="COMPOSIO_API_KEY not configured on API server")

    g = app_group.strip().lower()
    if g not in _COMPOSIO_TOOLKITS_BY_APP_GROUP:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid app_group: {app_group}. Expected one of: {', '.join(sorted(_COMPOSIO_TOOLKITS_BY_APP_GROUP))}.",
        )
    toolkits = _COMPOSIO_TOOLKITS_BY_APP_GROUP[g]
    toolkit_param = ",".join(toolkits)

    try:
        from composio import Composio

        c = Composio(api_key=key)
        merged: dict[str, dict] = {}
        cursor: str | None = None
        while True:
            resp = c.client.tools.list(
                toolkit_slug=toolkit_param,
                limit=500,
                cursor=cursor,
            )
            for item in resp.items:
                row = _serialize_tool_item(item)
                s = row["slug"]
                if s and s not in merged:
                    merged[s] = row
            cursor = getattr(resp, "next_cursor", None) or None
            if not cursor:
                break
            if len(merged) >= 4000:
                logger.warning("composio toolkit-tools: hit merge cap for app_group=%s", g)
                break

        tools = sorted(merged.values(), key=lambda x: (x["name"].lower(), x["slug"]))
        return {"app_group": g, "toolkits": toolkits, "tools": tools, "composio_configured": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("composio toolkit-tools failed app_group=%s: %s", g, e)
        raise HTTPException(status_code=502, detail="Upstream service error") from e


@router.get("/tool-schema")
async def composio_tool_schema(
    slug: str = Query(..., min_length=1, description="Composio tool slug, e.g. GMAIL_SEND_EMAIL"),
    uid: str = Depends(get_current_uid),
):
    """Return input parameter JSON Schema for a tool (for form-based arguments in the workflow editor)."""
    _ = uid
    key = (os.getenv("COMPOSIO_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="COMPOSIO_API_KEY not configured on API server")

    s = slug.strip()
    if not s:
        raise HTTPException(status_code=400, detail="slug is required")

    try:
        from composio import Composio

        c = Composio(api_key=key)
        try:
            tool = c.tools.get_raw_composio_tool_by_slug(s)
        except Exception as e:
            err = str(e).lower()
            if "404" in err or "not found" in err:
                raise HTTPException(status_code=404, detail=f"Unknown tool: {s}") from e
            logger.exception("composio tool-schema retrieve failed slug=%s", s)
            raise HTTPException(status_code=502, detail="Upstream service error") from e

        tk = getattr(tool, "toolkit", None)
        toolkit_slug = str(getattr(tk, "slug", "") or "").lower() if tk else ""
        human = getattr(tool, "human_description", None)
        desc = str(human or getattr(tool, "description", "") or "").strip()
        params = getattr(tool, "input_parameters", None)
        if not isinstance(params, dict):
            params = {}

        return {
            "slug": str(getattr(tool, "slug", "") or s),
            "name": str(getattr(tool, "name", "") or s),
            "description": desc,
            "toolkit_slug": toolkit_slug,
            "input_parameters": params,
            "composio_configured": True,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("composio tool-schema failed slug=%s: %s", s, e)
        raise HTTPException(status_code=502, detail="Upstream service error") from e
