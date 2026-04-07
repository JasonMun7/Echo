"""
Integrations: list, disconnect, and optional `api_call` execution via Auth0 Token Vault.

GET    /api/integrations              — list catalog + connection state
DELETE /api/integrations/{name}       — disconnect
POST   /api/integrations/{name}/call  — execute connector method
GET    /api/integrations/{name}/methods — list methods
"""
import asyncio
import importlib
import logging

import firebase_admin.firestore
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_uid, get_firebase_app

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/integrations", tags=["integrations"])

try:
    from echo_prism_agent.integrations.resolver import get_integration_access_token
except ImportError:
    get_integration_access_token = None  # type: ignore[misc, assignment]


async def _oauth_token_failure_detail(uid: str, name: str, db: firebase_admin.firestore.Client) -> str:
    """
    When /call has no provider access token, explain why and include Auth0 federated exchange error.
    Common case: Auth0 is linked (refresh token exists) but user never completed Connect for this integration.
    """
    try:
        from echo_prism_agent.auth0_token_vault import (
            connection_name_for_integration,
            federated_token_exchange_response,
            normalize_integration_id,
        )
    except ImportError:
        return (
            f"Integration '{name}' has no provider token (echo_prism_agent unavailable for diagnostics). "
            "Link Auth0, then Connect this integration via Token Vault."
        )

    user_doc = await asyncio.to_thread(lambda: db.collection("users").document(uid).get())
    udata = user_doc.to_dict() or {}
    refresh = (udata.get("auth0_refresh_token") or "").strip()
    if not refresh:
        return (
            f"No Auth0 refresh token for this user. Use Universal Login to link Auth0 first, "
            f"then Connect the '{name}' integration."
        )

    iid = normalize_integration_id(name)
    conn = connection_name_for_integration(iid)
    if not conn:
        return (
            f"Auth0 is linked, but this server has no Auth0 connection name for integration '{name}'. "
            f"Set AUTH0_CONNECTION_{name.upper()} to match Authentication → Social connection name."
        )

    status, body = await federated_token_exchange_response(refresh, conn)
    auth0_hint = ""
    if isinstance(body, dict):
        auth0_hint = (body.get("error_description") or body.get("error") or "").strip()
    if not auth0_hint:
        auth0_hint = f"HTTP {status}" if status else "empty response"

    # Keep detail as one paragraph; clients show full string in debug JSON.
    return (
        f"Auth0 is linked, but Token Vault did not return a provider access token for connection "
        f"'{conn}'. Signing in with Google (or another IdP) only links Echo to Auth0; you still need "
        f"to click Connect on this integration so Auth0 can store third-party tokens for APIs. "
        f"Auth0 federated exchange: {auth0_hint}"
    )

AVAILABLE_INTEGRATIONS = {
    "slack": {
        "name": "Slack",
        "description": "Send messages, list channels, manage workspace",
        "icon": "IconBrandSlack",
        "oauth": True,
        "scopes": "channels:read,chat:write,users:read (via Auth0 Slack connection)",
    },
    "github": {
        "name": "GitHub",
        "description": "Create issues, list PRs, manage repos",
        "icon": "IconBrandGithub",
        "oauth": True,
        "scopes": "repo,issues (via Auth0 GitHub connection)",
    },
    "google": {
        "name": "Google",
        "description": "Gmail, Calendar, Drive, and other Google APIs (via Auth0 Token Vault)",
        "icon": "IconBrandGoogle",
        "oauth": True,
        "scopes": "Calendar, Gmail, Drive, Sheets, Slides, Contacts, Tasks — see agent/echo_prism_agent/integrations/google_scopes.py",
    },
}

_TOKEN_VAULT_IDS = frozenset({"slack", "github", "google"})


@router.get("")
async def list_integrations(uid: str = Depends(get_current_uid)):
    """List all available integrations and which ones the user has connected."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    user_doc = db.collection("users").document(uid).get()
    udata = user_doc.to_dict() or {}
    auth0_linked = bool((udata.get("auth0_refresh_token") or "").strip())

    connected_docs = (
        db.collection("users").document(uid).collection("integrations").stream()
    )
    connected = {d.id: d.to_dict() for d in connected_docs}

    result = []
    for key, meta in AVAILABLE_INTEGRATIONS.items():
        entry = {**meta, "id": key}
        vault_flag = udata.get(f"vault_connection_{key}") is True
        if key in connected:
            conn = connected[key]
            entry["connected"] = True
            entry["connected_at"] = conn.get("connected_at")
            entry["account_name"] = conn.get("team_name") or conn.get("account_name")
        elif vault_flag:
            entry["connected"] = True
            entry["account_name"] = "Auth0 Token Vault"
        else:
            entry["connected"] = False
        if meta.get("oauth") and key in _TOKEN_VAULT_IDS:
            entry["token_vault"] = True
        result.append(entry)

    return {
        "integrations": result,
        "auth0_linked": auth0_linked,
        "auth0_sub": udata.get("auth0_sub"),
        "auth0_email": udata.get("auth0_email"),
    }


@router.delete("/{name}")
async def disconnect_integration(name: str, uid: str = Depends(get_current_uid)):
    """Remove integration tokens from Firestore and vault connection flag."""
    from google.cloud.firestore import DELETE_FIELD

    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    ref = db.collection("users").document(uid).collection("integrations").document(name)
    if ref.get().exists:
        ref.delete()
    user_ref = db.collection("users").document(uid)
    user_ref.update({f"vault_connection_{name}": DELETE_FIELD})
    return {"ok": True}


class IntegrationCallBody(BaseModel):
    method: str
    args: dict = {}


@router.post("/{name}/call")
async def call_integration(
    name: str,
    body: IntegrationCallBody,
    uid: str = Depends(get_current_uid),
):
    """Execute an integration method directly."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)

    token_doc = (
        db.collection("users").document(uid).collection("integrations").document(name).get()
    )
    if not token_doc.exists and AVAILABLE_INTEGRATIONS.get(name, {}).get("oauth"):
        pass

    token_data = token_doc.to_dict() if token_doc.exists else {}
    if get_integration_access_token:
        access_token = await get_integration_access_token(uid, name, db)
    else:
        access_token = token_data.get("access_token", "") or ""

    if not access_token and AVAILABLE_INTEGRATIONS.get(name, {}).get("oauth"):
        detail = await _oauth_token_failure_detail(uid, name, db)
        raise HTTPException(status_code=400, detail=detail)

    try:
        connector = importlib.import_module(f"echo_prism_agent.integrations.{name}")
        result = await connector.execute(body.method, body.args, access_token)
        return {"ok": True, "result": result}
    except ModuleNotFoundError:
        raise HTTPException(status_code=501, detail=f"Integration '{name}' not implemented")
    except Exception as e:
        logger.error("Integration %s.%s failed: %s", name, body.method, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{name}/methods")
async def list_methods(name: str, uid: str = Depends(get_current_uid)):
    """List available methods for an integration."""
    try:
        connector = importlib.import_module(f"echo_prism_agent.integrations.{name}")
        methods = getattr(connector, "METHODS", {})
        return {"integration": name, "methods": methods}
    except ModuleNotFoundError:
        raise HTTPException(status_code=404, detail=f"Integration '{name}' not found")
