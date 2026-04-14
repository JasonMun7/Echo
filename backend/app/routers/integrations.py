"""
Integrations: catalog and disconnect (OAuth via Composio — see ``/api/composio/link``).

GET    /api/integrations        — list catalog + optional Firestore flags
DELETE /api/integrations/{name} — revoke Composio OAuth + remove optional Firestore doc

Toolkit slugs sent to Tool Router must be verified (never guessed); see
``.agents/skills/composio/AGENTS.md`` (“Verify Tool Slugs Before Use”) and
``composio manage toolkits info "<slug>"`` when adding catalog entries.
"""

import logging
import os

import firebase_admin.firestore
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_uid, get_firebase_app

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/integrations", tags=["integrations"])

AVAILABLE_INTEGRATIONS = {
    "slack": {
        "name": "Slack",
        "tagline": "Messages, channels & workspace actions.",
        "description": "Send messages, list channels, manage workspace (Composio Managed Auth)",
        "icon": "IconBrandSlack",
        "oauth": True,
        "scopes": "OAuth via Composio — configure auth config in Composio dashboard",
    },
    "github": {
        "name": "GitHub",
        "tagline": "Issues, repos & pull requests.",
        "description": "Issues, repos, PRs (Composio Managed Auth)",
        "icon": "IconBrandGithub",
        "oauth": True,
        "scopes": "OAuth via Composio",
    },
    "google": {
        "name": "Google",
        "tagline": "Google account & APIs for Calendar, Drive, and more.",
        "description": 'Connects via Composio\'s googlecalendar toolkit (Tool Router rejects the legacy umbrella slug "google").',
        "icon": "IconBrandGoogle",
        "oauth": True,
        "scopes": "OAuth via Composio",
    },
    "gmail": {
        "name": "Gmail",
        "tagline": "Send, read & search email.",
        "description": 'Send and read mail (Composio `gmail` toolkit). Connect Gmail and "Google" separately if you use both.',
        "icon": "IconBrandGoogle",
        "oauth": True,
        "scopes": "OAuth via Composio; Gmail scopes in Composio auth config",
    },
}

# Echo product ids → Composio toolkit slugs. TR v2 rejects "google"; map was validated by API error
# and aligns with ``.agents/skills/composio/AGENTS.md`` / ``rules/tr-session-basic.md`` (use real slugs).
_ECHO_TO_COMPOSIO_TOOLKIT: dict[str, str] = {
    "google": "googlecalendar",
}


def echo_catalog_id_to_composio_toolkit(catalog_id: str) -> str:
    """Map ``GET /api/integrations`` id to the Composio toolkit slug used for sessions and OAuth."""
    c = (catalog_id or "").strip().lower()
    return _ECHO_TO_COMPOSIO_TOOLKIT.get(c, c)


def composio_toolkits_for_session() -> list[str]:
    """Distinct Composio slugs for ``Composio.create`` / ``session.toolkits`` (valid slugs only)."""
    seen: set[str] = set()
    ordered: list[str] = []
    for k in AVAILABLE_INTEGRATIONS:
        s = echo_catalog_id_to_composio_toolkit(k)
        if s not in seen:
            seen.add(s)
            ordered.append(s)
    return ordered


def composio_raw_toolkit_slugs_accepted() -> frozenset[str]:
    """Composio toolkit slugs allowed when ``toolkit`` is already a raw slug (not only Echo catalog ids)."""
    slugs: set[str] = set(composio_toolkits_for_session())
    for k in AVAILABLE_INTEGRATIONS:
        slugs.add(echo_catalog_id_to_composio_toolkit(k))
    slugs.add("googledrive")
    return frozenset(slugs)


def composio_slug_activates_catalog_entry(catalog_id: str, composio_slugs: set[str]) -> bool:
    """Whether ``composio_account_active`` should be true for this catalog row."""
    return echo_catalog_id_to_composio_toolkit(catalog_id) in composio_slugs


def revoke_composio_connections_for_catalog(uid: str, catalog_key: str) -> int:
    """
    Soft-delete ACTIVE Composio connected accounts for this catalog integration’s toolkit.

    Echo’s UI “disconnect” must clear Composio OAuth; otherwise ``GET /api/integrations`` still
    reports ``composio_account_active`` from ``connected_accounts.list``.
    """
    api_key = (os.getenv("COMPOSIO_API_KEY") or "").strip()
    if not api_key:
        return 0
    k = (catalog_key or "").strip().lower()
    if k not in AVAILABLE_INTEGRATIONS:
        return 0
    composio_slug = echo_catalog_id_to_composio_toolkit(k)
    from composio import Composio

    c = Composio(api_key=api_key)
    resp = c.connected_accounts.list(user_ids=[uid], statuses=["ACTIVE"], limit=100)
    removed = 0
    failed: list[str] = []
    for item in resp.items:
        tk = getattr(item, "toolkit", None)
        slug = str(getattr(tk, "slug", "") or "").lower() if tk else ""
        if slug != composio_slug:
            continue
        acc_id = getattr(item, "id", None)
        if not acc_id:
            continue
        try:
            c.connected_accounts.delete(str(acc_id))
            removed += 1
        except Exception as e:
            logger.warning(
                "Composio connected_accounts.delete failed uid=%s toolkit=%s acc_id=%s: %s",
                uid,
                composio_slug,
                acc_id,
                e,
            )
            failed.append(str(acc_id))
    if failed:
        raise RuntimeError(
            f"Failed to revoke {len(failed)} Composio account(s) for {composio_slug}: {', '.join(failed)}"
        )
    return removed


def _composio_active_toolkit_slugs(uid: str) -> set[str] | None:
    """
    Catalog toolkit slugs with an active Composio connection.

    Merges ``session.toolkits()`` with ``connected_accounts.list(ACTIVE)`` — after OAuth, the
    accounts API often reflects the new connection before toolkits state catches up, so the UI
    updates reliably.
    """
    key = (os.getenv("COMPOSIO_API_KEY") or "").strip()
    if not key:
        return None
    slugs: set[str] = set()
    try:
        from composio import Composio

        catalog = composio_toolkits_for_session()
        c = Composio(api_key=key)

        session = c.create(user_id=uid, toolkits=catalog)
        resp = session.toolkits(toolkits=catalog, limit=50)
        for item in resp.items:
            if item.connection and item.connection.is_active:
                slugs.add(item.slug.lower())

        try:
            acc = c.connected_accounts.list(user_ids=[uid], statuses=["ACTIVE"], limit=100)
            for row in acc.items:
                tk = getattr(row, "toolkit", None)
                s = getattr(tk, "slug", None) if tk else None
                if s:
                    slugs.add(str(s).lower())
        except Exception as e2:
            logger.debug("connected_accounts.list merge skipped: %s", e2)

        return slugs
    except Exception as e:
        logger.warning("Composio active toolkit detection failed: %s", e)
        return None


@router.get("")
async def list_integrations(uid: str = Depends(get_current_uid)):
    """List integrations and optional Firestore connection metadata."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)

    connected_docs = db.collection("users").document(uid).collection("integrations").stream()
    connected = {d.id: d.to_dict() for d in connected_docs}

    active_slugs = _composio_active_toolkit_slugs(uid)

    result = []
    for key, meta in AVAILABLE_INTEGRATIONS.items():
        entry = {**meta, "id": key}
        if key in connected:
            conn = connected[key]
            entry["connected"] = True
            entry["connected_at"] = conn.get("connected_at")
            entry["account_name"] = conn.get("team_name") or conn.get("account_name")
        else:
            entry["connected"] = False
        if active_slugs is not None:
            entry["composio_account_active"] = composio_slug_activates_catalog_entry(key, active_slugs)
        else:
            entry["composio_account_active"] = None
        result.append(entry)

    return {
        "integrations": result,
        "composio_configured": bool((os.getenv("COMPOSIO_API_KEY") or "").strip()),
    }


@router.delete("/{name}")
async def disconnect_integration(name: str, uid: str = Depends(get_current_uid)):
    """Revoke Composio OAuth for this toolkit, then remove optional Firestore metadata."""
    n = name.strip().lower()
    if n not in AVAILABLE_INTEGRATIONS:
        raise HTTPException(status_code=404, detail=f"Unknown integration: {name}")

    if (os.getenv("COMPOSIO_API_KEY") or "").strip():
        try:
            revoke_composio_connections_for_catalog(uid, n)
        except Exception as e:
            logger.exception("Composio revoke failed uid=%s integration=%s", uid, n)
            raise HTTPException(
                status_code=502,
                detail="Failed to revoke connection in Composio. Try again in a moment.",
            ) from e

    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    ref = db.collection("users").document(uid).collection("integrations").document(n)
    if ref.get().exists:
        ref.delete()
    return {"ok": True}
