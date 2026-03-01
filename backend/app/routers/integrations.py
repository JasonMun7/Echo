"""
App Integrations: OAuth + execution endpoints.
GET  /api/integrations                       — list available + connected
GET  /api/integrations/{name}/connect        — initiate OAuth
GET  /api/integrations/{name}/callback       — handle OAuth callback
DELETE /api/integrations/{name}              — disconnect
POST /api/integrations/{name}/call           — execute a method
GET  /api/integrations/{name}/methods        — list available methods
"""
import importlib
import logging
import os

import firebase_admin.firestore
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from google.cloud.firestore import SERVER_TIMESTAMP
from pydantic import BaseModel

from app.auth import get_current_uid, get_firebase_app

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/integrations", tags=["integrations"])

AVAILABLE_INTEGRATIONS = {
    "slack": {
        "name": "Slack",
        "description": "Send messages, list channels, manage workspace",
        "icon": "IconBrandSlack",
        "oauth": True,
        "scopes": "channels:read,chat:write,users:read",
    },
    "gmail": {
        "name": "Gmail",
        "description": "Send emails, read inbox, manage labels",
        "icon": "IconMail",
        "oauth": False,
        "note": "Auto-connected via Google sign-in",
    },
    "google_sheets": {
        "name": "Google Sheets",
        "description": "Read and write spreadsheet data",
        "icon": "IconTable",
        "oauth": False,
        "note": "Auto-connected via Google sign-in",
    },
    "google_calendar": {
        "name": "Google Calendar",
        "description": "Create events, list schedules",
        "icon": "IconCalendar",
        "oauth": False,
        "note": "Auto-connected via Google sign-in",
    },
    "notion": {
        "name": "Notion",
        "description": "Create pages, query databases",
        "icon": "IconBrandNotion",
        "oauth": True,
        "scopes": "read_content,update_content,insert_content",
    },
    "github": {
        "name": "GitHub",
        "description": "Create issues, list PRs, manage repos",
        "icon": "IconBrandGithub",
        "oauth": True,
        "scopes": "repo,issues",
    },
    "linear": {
        "name": "Linear",
        "description": "Create and update issues, manage projects",
        "icon": "IconBrandLinear",
        "oauth": True,
        "scopes": "read,write",
    },
}

OAUTH_CONFIGS = {
    "slack": {
        "auth_url": "https://slack.com/oauth/v2/authorize",
        "token_url": "https://slack.com/api/oauth.v2.access",
        "client_id_env": "SLACK_CLIENT_ID",
        "client_secret_env": "SLACK_CLIENT_SECRET",
    },
    "github": {
        "auth_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "client_id_env": "GITHUB_CLIENT_ID",
        "client_secret_env": "GITHUB_CLIENT_SECRET",
    },
    "notion": {
        "auth_url": "https://api.notion.com/v1/oauth/authorize",
        "token_url": "https://api.notion.com/v1/oauth/token",
        "client_id_env": "NOTION_CLIENT_ID",
        "client_secret_env": "NOTION_CLIENT_SECRET",
    },
    "linear": {
        "auth_url": "https://linear.app/oauth/authorize",
        "token_url": "https://api.linear.app/oauth/token",
        "client_id_env": "LINEAR_CLIENT_ID",
        "client_secret_env": "LINEAR_CLIENT_SECRET",
    },
}


@router.get("")
async def list_integrations(uid: str = Depends(get_current_uid)):
    """List all available integrations and which ones the user has connected."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    connected_docs = (
        db.collection("users").document(uid).collection("integrations").stream()
    )
    connected = {d.id: d.to_dict() for d in connected_docs}

    result = []
    for key, meta in AVAILABLE_INTEGRATIONS.items():
        entry = {**meta, "id": key}
        if key in connected:
            conn = connected[key]
            entry["connected"] = True
            entry["connected_at"] = conn.get("connected_at")
            entry["account_name"] = conn.get("team_name") or conn.get("account_name")
        else:
            entry["connected"] = meta.get("oauth") is False  # Google services auto-connected
        result.append(entry)

    return {"integrations": result}


@router.get("/{name}/connect")
async def connect_integration(
    name: str,
    request: Request,
    uid: str = Depends(get_current_uid),
):
    """Initiate OAuth flow for a third-party integration."""
    if name not in OAUTH_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Integration '{name}' does not support OAuth")

    cfg = OAUTH_CONFIGS[name]
    client_id = os.environ.get(cfg["client_id_env"], "")
    if not client_id:
        raise HTTPException(status_code=500, detail=f"{cfg['client_id_env']} not configured")

    meta = AVAILABLE_INTEGRATIONS[name]
    redirect_uri = str(request.base_url).rstrip("/") + f"/api/integrations/{name}/callback"
    state = uid  # Use uid as state for simplicity (production: sign with HMAC)

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": meta.get("scopes", ""),
        "state": state,
        "response_type": "code",
    }
    if name == "notion":
        params["owner"] = "user"

    from urllib.parse import urlencode
    auth_url = cfg["auth_url"] + "?" + urlencode(params)
    return {"auth_url": auth_url}


@router.get("/{name}/callback")
async def integration_callback(
    name: str,
    request: Request,
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
):
    """Handle OAuth callback and store tokens in Firestore."""
    if error:
        return RedirectResponse(url=f"/dashboard/integrations?error={error}")

    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    uid = state  # In production: verify HMAC signature
    cfg = OAUTH_CONFIGS.get(name)
    if not cfg:
        raise HTTPException(status_code=400, detail=f"Unknown integration: {name}")

    client_id = os.environ.get(cfg["client_id_env"], "")
    client_secret = os.environ.get(cfg["client_secret_env"], "")
    redirect_uri = str(request.base_url).rstrip("/") + f"/api/integrations/{name}/callback"

    import httpx
    token_data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            cfg["token_url"],
            data=token_data,
            headers={"Accept": "application/json"},
        )
        tokens = resp.json()

    if "error" in tokens:
        return RedirectResponse(url=f"/dashboard/integrations?error={tokens['error']}")

    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    db.collection("users").document(uid).collection("integrations").document(name).set({
        "name": name,
        "connected_at": SERVER_TIMESTAMP,
        "access_token": tokens.get("access_token"),
        "refresh_token": tokens.get("refresh_token"),
        "scope": tokens.get("scope"),
        "team_name": tokens.get("team", {}).get("name") if name == "slack" else None,
    }, merge=True)

    return RedirectResponse(url="/dashboard/integrations?connected=" + name)


@router.delete("/{name}")
async def disconnect_integration(name: str, uid: str = Depends(get_current_uid)):
    """Remove integration tokens from Firestore."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    ref = db.collection("users").document(uid).collection("integrations").document(name)
    if ref.get().exists:
        ref.delete()
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
        raise HTTPException(status_code=400, detail=f"Integration '{name}' not connected")

    token_data = token_doc.to_dict() if token_doc.exists else {}
    access_token = token_data.get("access_token", "")

    try:
        connector = importlib.import_module(f"agent.integrations.{name}")
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
        connector = importlib.import_module(f"agent.integrations.{name}")
        methods = getattr(connector, "METHODS", {})
        return {"integration": name, "methods": methods}
    except ModuleNotFoundError:
        raise HTTPException(status_code=404, detail=f"Integration '{name}' not found")
