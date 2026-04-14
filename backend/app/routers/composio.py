"""
Composio: OAuth connect links (Managed Auth).

**User ID:** ``uid`` from Firebase ID token verification is passed to ``composio.create(user_id=…)``.
That is the canonical Composio ``user_id`` for this user — stable, unique, and never shared across users.
"""

from __future__ import annotations

import logging
import os

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
        req = session.authorize(composio_t, callback_url=_oauth_callback_url())
        url = getattr(req, "redirect_url", None) or getattr(req, "redirectUrl", None)
        if not url:
            raise HTTPException(status_code=502, detail="Composio did not return a redirect URL")
        cb = _oauth_callback_url()
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
