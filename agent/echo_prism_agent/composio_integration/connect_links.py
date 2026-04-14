"""
Composio Managed Auth connect URLs (same semantics as backend ``GET /api/composio/link``).

``uid`` must be the Firebase Authentication user id — Composio ``user_id`` for connected accounts.
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def infer_toolkit_from_composio_slug(slug: str) -> str:
    """
    Best-effort toolkit slug for OAuth (first underscore-delimited segment, lowercased).

    Examples: ``GMAIL_SEND_EMAIL`` → ``gmail``, ``SLACK_LIST_ALL_CHANNELS`` → ``slack``.
    """
    s = (slug or "").strip().upper()
    if not s or s.startswith("COMPOSIO_"):
        return ""
    parts = s.split("_")
    return (parts[0] or "").lower()


def fetch_composio_connect_url_sync(uid: str, toolkit: str) -> str | None:
    """
    Return a Composio OAuth redirect URL for ``toolkit``, or None on failure.

    Uses ``composio.create`` + ``session.authorize`` (Composio-managed auth configs).
    """
    key = (os.getenv("COMPOSIO_API_KEY") or "").strip()
    t = (toolkit or "").strip().lower().replace(" ", "")
    if not key or not uid or not t:
        return None
    try:
        from composio import Composio

        callback = (os.getenv("COMPOSIO_OAUTH_CALLBACK_URL") or os.getenv("FRONTEND_ORIGIN") or "").strip() or None
        c = Composio(api_key=key)
        session = c.create(user_id=uid, toolkits=[t])
        req = session.authorize(t, callback_url=callback)
        url = getattr(req, "redirect_url", None) or getattr(req, "redirectUrl", None)
        return str(url) if url else None
    except Exception as e:
        logger.debug("Composio connect URL failed toolkit=%s: %s", t, e)
        return None


def enrich_auth_failure(uid: str, slug: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Attach ``toolkit`` and ``connect_url`` when ``composio_auth_hint`` is set."""
    if not payload.get("composio_auth_hint"):
        return payload
    out = dict(payload)
    tk = infer_toolkit_from_composio_slug(slug)
    if tk:
        out["toolkit"] = tk
        url = fetch_composio_connect_url_sync(uid, tk)
        if url:
            out["connect_url"] = url
    return out
