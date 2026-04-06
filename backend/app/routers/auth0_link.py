"""
Auth0 link (Approach A): store Auth0 refresh token + sub on Firestore user doc for Token Vault exchange.

Callback URL must match Auth0 Application: https://<backend>/api/auth0/callback
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from urllib.parse import quote, urlencode

import firebase_admin.firestore
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from google.cloud.firestore import DELETE_FIELD, SERVER_TIMESTAMP

from app.auth import get_current_uid, get_firebase_app
from app.config import (
    AUTH0_AUDIENCE,
    AUTH0_CLIENT_ID,
    AUTH0_CLIENT_SECRET,
    AUTH0_DOMAIN,
    AUTH0_MGMT_CLIENT_ID,
    AUTH0_MGMT_CLIENT_SECRET,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth0", tags=["auth0"])


def _b64encode_state(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64decode_state(state: str) -> dict:
    pad = "=" * (-len(state) % 4)
    raw = base64.urlsafe_b64decode(state + pad)
    return json.loads(raw.decode())


def _auth0_configured() -> bool:
    return bool(AUTH0_DOMAIN and AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET)


def _vault_authorize_omit_audience() -> bool:
    """If true, /vault-url does not pass `audience` (some tenants store federated RT only without it)."""
    v = (os.getenv("AUTH0_VAULT_AUTHORIZE_OMIT_AUDIENCE") or "").strip().lower()
    return v in ("1", "true", "yes")


def _vault_authorize_audience_mode() -> str:
    if _vault_authorize_omit_audience():
        return "omitted_by_env"
    if (AUTH0_AUDIENCE or "").strip():
        return "included"
    return "none"


def _vault_probe_hints(auth0_sub: object, error_message: str) -> dict[str, str]:
    """Non-secret hints when federated Token Vault probe fails."""
    hints: dict[str, str] = {}
    if not isinstance(auth0_sub, str) or not auth0_sub.strip():
        hints["auth0_sub_note"] = "missing — link Auth0 again"
        return hints
    strategy = auth0_sub.split("|", 1)[0]
    hints["auth0_sub_strategy"] = strategy
    if "Federated connection Refresh Token not found" not in error_message:
        return hints
    if auth0_sub.startswith("google-oauth2|"):
        hints["likely_fix"] = (
            "Token Vault needs a stored Google refresh token for connection google-oauth2 (connected account "
            "separate from logging into Auth0 with Google). Complete Integrations → Connect Google; in Auth0 "
            "enable Connected Accounts for Token Vault + Offline Access on the Google connection. "
            "Check Management API GET .../users/{id}/connected-accounts if unsure."
        )
    elif auth0_sub.startswith("auth0|"):
        hints["likely_fix"] = (
            "auth0_sub is auth0| but Token Vault has no Google refresh token. In Echo: disconnect Google; "
            "in Google Account → Third-party access revoke the Auth0/Echo app; connect Google again with Offline "
            "Access enabled on the Auth0 Google connection. If it still fails, your tenant may require Auth0 "
            "Connected Accounts (My Account API) instead of Echo's /authorize vault URL."
        )
    return hints


def _vault_troubleshooting_steps(oauth_error: object, auth0_sub: object) -> list[str]:
    """Actionable steps when federated Token Vault exchange fails (no secrets)."""
    err = oauth_error if isinstance(oauth_error, str) else ""
    steps: list[str] = [
        "Application (Echo Web): Dashboard → Applications → Advanced → Grant Types must include "
        "Authorization Code, Refresh Token, and Token Vault (federated connection access token exchange).",
        "Google connection: Authentication → Social → Google — enable Connected Accounts for Token Vault, "
        "Offline Access, and this application under the connection’s Applications tab.",
        "In Echo: Integrations → Connect Google after Link Auth0. Universal Login with Google does not by itself "
        "store the federated provider refresh token Token Vault needs for API calls.",
    ]
    if err == "federated_connection_refresh_token_not_found":
        steps.insert(
            0,
            "Auth0 error federated_connection_refresh_token_not_found: vault has no federated refresh token for "
            "this connection yet (Offline Access alone does not create it until a successful Connect/vault flow).",
        )
        if not _vault_authorize_omit_audience() and (AUTH0_AUDIENCE or "").strip():
            steps.append(
                "Retry: set backend env AUTH0_VAULT_AUTHORIZE_OMIT_AUDIENCE=1 so the Connect Google authorize URL "
                "omits `audience` (Link Auth0 can still use audience). Disconnect/revoke Google third-party access if "
                "needed, then Connect Google again and re-run diagnostics.",
            )
    if isinstance(auth0_sub, str) and auth0_sub.startswith("google-oauth2|"):
        steps.append(
            "You use Google to sign into Auth0 (google-oauth2|…). Still complete Integrations → Connect Google "
            "so the vault-specific /authorize with connection=google-oauth2 runs and Auth0 can persist tokens.",
        )
    return steps


def _callback_url(request: Request) -> str:
    explicit = (os.getenv("AUTH0_CALLBACK_URL") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    return str(request.base_url).rstrip("/") + "/api/auth0/callback"


def _vault_oauth_redirect_uri(request: Request) -> str:
    """
    redirect_uri for Connect (Token Vault) /authorize.

    Auth0's auth0-fastapi sample uses a *separate* callback path for connect
    (``/api/auth/connect/callback``) from login (``/api/auth/callback``); see
    ``authenticate-users-langchain-fastapi-py-sample`` and auth0-fastapi
    ``server/routes.py`` (``mount_connect_routes``).

    Echo defaults to the same URL as Link (``_callback_url``). Set
    ``AUTH0_VAULT_CALLBACK_URL`` to mirror the sample (e.g. ``.../api/auth0/connect/callback``)
    and add that URL to Auth0 Application → Allowed Callback URLs.
    """
    v = (os.getenv("AUTH0_VAULT_CALLBACK_URL") or "").strip()
    if v:
        return v.rstrip("/")
    return _callback_url(request)


def _redirect_uri_for_token_exchange(request: Request, payload: dict) -> str:
    """Must match the redirect_uri used in /authorize for this authorization code (RFC 6749)."""
    op = payload.get("op", "link")
    if op == "vault":
        v = (os.getenv("AUTH0_VAULT_CALLBACK_URL") or "").strip()
        if v:
            return v.rstrip("/")
    explicit = (os.getenv("AUTH0_CALLBACK_URL") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    return str(request.url).split("?")[0]


async def _verify_vault_federated_exchange(
    integration_echo_id: str,
    auth0_refresh_token: str,
    *,
    attempts: int = 1,
    delay_sec: float = 0.5,
) -> bool:
    """
    Run the same federated Token Vault exchange as the agent/diagnostics.
    Used so we only set vault_connection_* when Auth0 actually returns a provider access token.

    The OAuth callback may return before Auth0 has fully committed Connected Account / vault
    state; use attempts>1 with a short delay to reduce false negatives.
    """
    rt = (auth0_refresh_token or "").strip()
    if not rt:
        return False
    try:
        from echo_prism_agent.auth0_token_vault import (
            connection_name_for_integration,
            federated_token_exchange_response,
            token_vault_enabled,
        )
    except ImportError:
        logger.warning("echo_prism_agent unavailable; skipping Token Vault verification on callback")
        return False
    if not token_vault_enabled():
        return False
    conn = connection_name_for_integration(integration_echo_id)
    if not conn:
        return False

    n = max(1, attempts)
    last_err: str | None = None
    for i in range(n):
        status, data = await federated_token_exchange_response(rt, conn)
        tok = (data.get("access_token") or data.get("token") or "").strip()
        if status and status < 400 and tok:
            if i > 0:
                logger.info(
                    "Token Vault federated verification succeeded on attempt %s/%s (integration=%s)",
                    i + 1,
                    n,
                    integration_echo_id,
                )
            return True
        err_oauth = data.get("error")
        desc = data.get("error_description")
        if not status:
            last_err = str(desc or data.get("error") or "AUTH0_DOMAIN or config error")
        elif not tok:
            last_err = (
                f"HTTP {status} oauth_error={err_oauth!r} oauth_error_description={str(desc)[:300]!r}"
            )
        else:
            last_err = "exchange returned no access_token"
        logger.warning(
            "Token Vault federated verification attempt %s/%s failed (integration=%s): %s",
            i + 1,
            n,
            integration_echo_id,
            last_err,
        )
        if i < n - 1:
            await asyncio.sleep(delay_sec)

    logger.warning(
        "Token Vault federated verification exhausted attempts (integration=%s, last=%s)",
        integration_echo_id,
        last_err,
    )
    return False


@router.get("/diagnostics")
async def auth0_diagnostics(
    integration: str | None = Query(
        None,
        description="Optional Echo id (google|slack|github) — runs a Token Vault exchange probe",
    ),
    probe: bool = Query(
        True,
        description="If false, only return Firestore/env snapshot (no POST to Auth0)",
    ),
    uid: str = Depends(get_current_uid),
):
    """
    Troubleshooting snapshot for Auth0 link + Token Vault (no secrets in response).
    With ?integration=google, runs the same federated exchange as the agent (never returns tokens).
    """
    cid = (AUTH0_CLIENT_ID or "").strip()
    out: dict = {
        "auth0_configured": _auth0_configured(),
        "auth0_domain": AUTH0_DOMAIN or None,
        "client_id_suffix": cid[-8:] if len(cid) >= 8 else None,
        "audience_set": bool((AUTH0_AUDIENCE or "").strip()),
        "vault_authorize_audience": _vault_authorize_audience_mode(),
        "vault_callback_url_configured": bool((os.getenv("AUTH0_VAULT_CALLBACK_URL") or "").strip()),
        "auth0_link_connection_default": (os.getenv("AUTH0_LINK_CONNECTION") or "").strip() or None,
        "note": (
            "The federated Token Vault exchange asks Auth0 for an access token for `connection` (e.g. "
            "google-oauth2) using your stored Auth0 refresh token. That uses Auth0’s connected-accounts / "
            "vault state for that connection—not the fact that you may have signed into Auth0 with Google. "
            "Complete Integrations → Connect Google after linking Auth0; enable Offline Access and "
            "Connected Accounts for Token Vault on the Google social connection in Auth0."
        ),
    }
    try:
        from echo_prism_agent.auth0_token_vault import (
            connection_name_for_integration,
            federated_token_exchange_response,
            token_vault_enabled,
        )
    except ImportError:
        out["echo_prism_agent"] = "unavailable"
        return out

    out["token_vault_env_ok"] = token_vault_enabled()

    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    doc = db.collection("users").document(uid).get()
    data = doc.to_dict() or {}
    rt = (data.get("auth0_refresh_token") or "").strip()
    vault_flags = {
        k.replace("vault_connection_", ""): v
        for k, v in data.items()
        if isinstance(k, str) and k.startswith("vault_connection_")
    }
    sub = data.get("auth0_sub")
    out["firestore"] = {
        "auth0_sub": sub,
        "has_auth0_refresh_token": bool(rt),
        "auth0_refresh_token_length": len(rt) if rt else 0,
        "vault_connection_flags": vault_flags,
    }
    if isinstance(sub, str) and sub.startswith("google-oauth2|"):
        out["token_vault_hint"] = (
            "You signed into Auth0 with Google (auth0_sub is google-oauth2|…). Google API access still "
            "requires a Token Vault linked Google account: Integrations → Connect Google, with Auth0 Google set to "
            "Connected Accounts for Token Vault + Offline Access."
        )

    iid = (integration or "").strip().lower()
    if not iid:
        out["vault_probe"] = {"skipped": True, "reason": "pass ?integration=google (etc.) to probe"}
        return out

    conn = connection_name_for_integration(iid)
    out["connection_for_integration"] = conn
    if not conn:
        out["vault_probe"] = {"skipped": True, "reason": f"unknown integration {integration!r}"}
        return out
    if not probe:
        out["vault_probe"] = {"skipped": True, "reason": "probe=false"}
        return out
    if not rt:
        out["vault_probe"] = {
            "ok": False,
            "error": "No auth0_refresh_token on user doc — link Auth0 first (GET /api/auth0/link-url).",
        }
        return out
    if not out["token_vault_env_ok"]:
        out["vault_probe"] = {
            "ok": False,
            "error": "AUTH0_DOMAIN / CLIENT_ID / CLIENT_SECRET not set on this process.",
        }
        return out

    try:
        status, data = await federated_token_exchange_response(rt, conn)
        # status==0 means config error (e.g. missing AUTH0_DOMAIN), not HTTP success.
        if status and status < 400:
            tok = (data.get("access_token") or data.get("token") or "").strip()
            out["vault_probe"] = {
                "ok": bool(tok),
                "auth0_http_status": status,
                "issued_token_type": data.get("issued_token_type"),
                "expires_in": data.get("expires_in"),
                "scope_preview": (data.get("scope") or "")[:120] or None,
                "error": None if tok else "Exchange returned no access_token",
            }
        else:
            err_msg = str(
                data.get("error_description") or data.get("error") or "federated exchange failed"
            )
            oauth_err = data.get("error")
            out["vault_probe"] = {
                "ok": False,
                "auth0_http_status": status,
                "oauth_error": oauth_err,
                "oauth_error_description": data.get("error_description"),
                "error": err_msg,
            }
            out["vault_probe"].update(_vault_probe_hints(sub, err_msg))
            out["vault_probe"]["troubleshooting"] = _vault_troubleshooting_steps(oauth_err, sub)
    except Exception as e:
        err_msg = str(e)
        out["vault_probe"] = {"ok": False, "error": err_msg}
        out["vault_probe"].update(_vault_probe_hints(sub, err_msg))
    return out


async def _auth0_management_access_token(domain: str, cid: str, csec: str) -> str:
    token_url = f"https://{domain}/oauth/token"
    async with httpx.AsyncClient(timeout=30.0) as client:
        tr = await client.post(
            token_url,
            json={
                "client_id": cid,
                "client_secret": csec,
                "audience": f"https://{domain}/api/v2/",
                "grant_type": "client_credentials",
            },
        )
        tdata = tr.json()
    if tr.status_code >= 400:
        err = tdata.get("error_description") or tdata.get("error") or tr.text
        raise HTTPException(
            status_code=502,
            detail=f"Management API token request failed: {err}",
        )
    mtoken = (tdata.get("access_token") or "").strip()
    if not mtoken:
        raise HTTPException(status_code=502, detail="Management API token response missing access_token.")
    return mtoken


@router.get("/management-connected-accounts")
async def auth0_management_connected_accounts(uid: str = Depends(get_current_uid)):
    """
    Debug: Auth0 Management API — GET connected-accounts AND federated-connections-tokensets.

    These are different resources: My Account "connected accounts" can be empty while Token Vault
    still holds federated material (or vice versa). Federated exchange uses Token Vault.
    Uses AUTH0_MGMT_* from server env. M2M needs scopes for both endpoints (e.g. read:users; if 403,
    add scopes for federated tokensets per Auth0 Management API docs).
    """
    if not AUTH0_DOMAIN:
        raise HTTPException(status_code=503, detail="AUTH0_DOMAIN is not set on the server.")
    cid = (AUTH0_MGMT_CLIENT_ID or "").strip()
    csec = (AUTH0_MGMT_CLIENT_SECRET or "").strip()
    if not cid or not csec:
        raise HTTPException(
            status_code=503,
            detail=(
                "Set AUTH0_MGMT_CLIENT_ID and AUTH0_MGMT_CLIENT_SECRET on the backend "
                "(Machine-to-Machine app authorized for Auth0 Management API)."
            ),
        )

    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    doc = db.collection("users").document(uid).get()
    data = doc.to_dict() or {}
    sub = (data.get("auth0_sub") or "").strip()
    if not sub:
        raise HTTPException(
            status_code=400,
            detail="No auth0_sub on your user document — link Auth0 first.",
        )

    domain = AUTH0_DOMAIN
    mtoken = await _auth0_management_access_token(domain, cid, csec)
    user_path = quote(sub, safe="")
    headers = {"Authorization": f"Bearer {mtoken}"}
    ca_url = f"https://{domain}/api/v2/users/{user_path}/connected-accounts"
    fc_url = f"https://{domain}/api/v2/users/{user_path}/federated-connections-tokensets"

    def _parse_mgmt_body(r: httpx.Response) -> dict | list | str:
        try:
            return r.json()
        except Exception:
            return r.text[:800]

    async with httpx.AsyncClient(timeout=30.0) as client:
        ca_r, fc_r = await asyncio.gather(
            client.get(ca_url, headers=headers),
            client.get(fc_url, headers=headers),
        )

    ca_data = _parse_mgmt_body(ca_r)
    fc_data = _parse_mgmt_body(fc_r)

    fc_deprecation = (
        isinstance(fc_data, dict)
        and fc_r.status_code == 403
        and (
            "deprecated" in str(fc_data.get("message", "")).lower()
            or fc_data.get("errorCode") == "feature_not_enabled"
        )
    )

    note_parts = [
        "Two different Management API resources: "
        "`connected_accounts` = My Account API style list (can stay empty if you only used Universal Login). "
        "`federated_connections_tokensets` historically listed Token Vault data for federated exchange.",
        " If `auth0_sub` is `google-oauth2|...` but vault_probe still fails, complete Integrations → Connect Google "
        "(not only Universal Login) with Social → Google set to Connected Accounts for Token Vault + Offline Access.",
    ]
    if fc_deprecation:
        note_parts.append(
            " Auth0 may return 403 `deprecated` / `feature_not_enabled` on "
            "`GET .../federated-connections-tokensets` on your tenant—treat that as unavailable; "
            "rely on Dashboard → Users → Connected Accounts, `connected_accounts` above, and "
            "`GET /api/auth0/diagnostics?integration=google` vault_probe instead."
        )
    elif fc_r.status_code == 403:
        note_parts.append(
            " 403 on federated-connections-tokensets often means missing M2M scopes—see Auth0 Management API docs."
        )

    out: dict = {
        "auth0_user_id": sub,
        "note": "".join(note_parts),
        "federated_connections_tokensets_deprecated": fc_deprecation,
        "connected_accounts": {
            "http_status": ca_r.status_code,
            "data": ca_data if ca_r.status_code < 400 else None,
            "error": ca_data if ca_r.status_code >= 400 else None,
        },
        "federated_connections_tokensets": {
            "http_status": fc_r.status_code,
            "data": fc_data if fc_r.status_code < 400 else None,
            "error": fc_data if fc_r.status_code >= 400 else None,
        },
        # Back-compat for scripts expecting top-level keys:
        "management_api_http_status": ca_r.status_code,
        "connected_accounts_legacy_shape": ca_data if ca_r.status_code < 400 else None,
    }
    return out


@router.get("/status")
async def auth0_status(uid: str = Depends(get_current_uid)):
    """Whether the Firebase user has linked Auth0 (refresh token stored)."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    doc = db.collection("users").document(uid).get()
    data = doc.to_dict() or {}
    linked = bool((data.get("auth0_refresh_token") or "").strip())
    return {
        "linked": linked,
        "auth0_sub": data.get("auth0_sub"),
        "auth0_configured": _auth0_configured(),
    }


@router.get("/link-url")
async def auth0_link_url(
    request: Request,
    connection: str | None = Query(
        None,
        description=(
            "Auth0 connection name for Link only (e.g. Username-Password-Authentication). "
            "Use when Google is Token Vault–only so Universal Login must not use google-oauth2. "
            "Overrides AUTH0_LINK_CONNECTION env for this request."
        ),
    ),
    uid: str = Depends(get_current_uid),
):
    """Start Auth0 Universal Login to obtain a refresh token (link Echo user to Auth0).

    Optional ``connection`` query param or ``AUTH0_LINK_CONNECTION`` env forces that IdP for Link
    (typical: ``Username-Password-Authentication``) while Google remains available only via
    ``/vault-url`` (Connected Accounts / Token Vault).
    """
    if not _auth0_configured():
        raise HTTPException(status_code=503, detail="Auth0 is not configured on the server")
    state = _b64encode_state({"uid": uid, "op": "link"})
    params: dict[str, str] = {
        "response_type": "code",
        "client_id": AUTH0_CLIENT_ID,
        "redirect_uri": _callback_url(request),
        "scope": "openid profile email offline_access",
        "state": state,
    }
    link_conn = (connection or os.getenv("AUTH0_LINK_CONNECTION") or "").strip()
    if link_conn:
        params["connection"] = link_conn
    if AUTH0_AUDIENCE:
        params["audience"] = AUTH0_AUDIENCE
    url = f"https://{AUTH0_DOMAIN}/authorize?" + urlencode(params)
    return {"auth_url": url}


# When callers pass raw Auth0 connection=google-oauth2, Firestore keys use Echo id "google".
_ECHO_ID_FOR_AUTH0_CONNECTION: dict[str, str] = {
    "google-oauth2": "google",
}


@router.get("/vault-url")
async def auth0_vault_url(
    request: Request,
    integration: str | None = Query(
        None,
        description="Echo integration id: slack, github, google (preferred)",
    ),
    connection: str | None = Query(
        None,
        description="Raw Auth0 connection name (optional; use integration when possible)",
    ),
    uid: str = Depends(get_current_uid),
):
    """
    Auth0 "Connect Account" step for Token Vault (separate from Universal Login).

    Opens /authorize with connection=<provider> so Auth0 can store federated tokens in Token Vault.

    Official FastAPI samples in-repo: (1) ``authenticate-users-langchain-fastapi-py-sample`` uses
    legacy ``mount_connect_routes`` (split ``.../auth/connect/callback`` vs login) — Echo can mirror
    via ``AUTH0_VAULT_CALLBACK_URL`` + ``GET /api/auth0/connect/callback``.
    (2) ``call-others-apis-on-users-behalf-langchain-fastapi-py-sample`` uses **preferred**
    ``mount_connected_account_routes`` + ``start_connect_account`` (Token Vault quickstart); that path
    completes connect on the **main** ``/auth/callback`` (``connect_code``), like Echo's default of
    one callback URL for Link + Connect (Echo uses ``state`` + ``op=vault`` instead of ``connect_code``).

    Pass ?integration=slack|github|google so the backend maps to the Auth0 connection name
    (e.g. google → google-oauth2) and stores vault_connection_{echo_id} on the user doc.
    """
    if not _auth0_configured():
        raise HTTPException(status_code=503, detail="Auth0 is not configured on the server")
    if not integration and not connection:
        raise HTTPException(
            status_code=400,
            detail="Provide integration (slack|github|google) or connection",
        )
    try:
        from echo_prism_agent.auth0_token_vault import connection_name_for_integration
    except ImportError:
        raise HTTPException(status_code=503, detail="echo_prism_agent is not available")

    auth0_conn: str
    echo_key: str
    if integration:
        i = integration.strip().lower()
        mapped = connection_name_for_integration(i)
        if not mapped:
            raise HTTPException(status_code=400, detail=f"Unknown integration: {integration}")
        auth0_conn = mapped
        echo_key = i
    else:
        c = (connection or "").strip()
        if not c:
            raise HTTPException(status_code=400, detail="connection must not be empty")
        auth0_conn = c
        echo_key = _ECHO_ID_FOR_AUTH0_CONNECTION.get(c, c)

    state = _b64encode_state({"uid": uid, "op": "vault", "integration": echo_key})
    params: dict[str, str] = {
        "response_type": "code",
        "client_id": AUTH0_CLIENT_ID,
        "redirect_uri": _vault_oauth_redirect_uri(request),
        "scope": "openid profile email offline_access",
        "state": state,
        "connection": auth0_conn,
    }
    # Google often withholds a refresh token on repeat auth; Token Vault needs the federated RT.
    # Apply prompt=consent for any Google vault connection (including custom AUTH0_CONNECTION_GOOGLE names).
    explicit_google_conn = (os.getenv("AUTH0_CONNECTION_GOOGLE") or "").strip()
    is_google_vault = (
        echo_key == "google"
        or auth0_conn == "google-oauth2"
        or (bool(explicit_google_conn) and auth0_conn == explicit_google_conn)
    )
    if is_google_vault:
        params["prompt"] = "consent"
    if AUTH0_AUDIENCE and not _vault_authorize_omit_audience():
        params["audience"] = AUTH0_AUDIENCE
    url = f"https://{AUTH0_DOMAIN}/authorize?" + urlencode(params)
    return {"auth_url": url}


@router.get("/callback")
@router.get("/connect/callback")
async def auth0_callback(
    request: Request,
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    error_description: str | None = Query(None),
):
    """OAuth redirect target: store Auth0 tokens on the Firebase user document.

    Registered at ``/api/auth0/callback`` (Link + default Connect) and
    ``/api/auth0/connect/callback`` (optional; use with ``AUTH0_VAULT_CALLBACK_URL`` for Auth0 FastAPI sample parity).
    """
    base = (os.getenv("FRONTEND_ORIGIN") or "http://localhost:3000").rstrip("/")
    if error:
        logger.warning(
            "Auth0 callback returned error=%s description=%s",
            error,
            (error_description or "")[:500],
        )
        qs = "error=" + quote(error, safe="")
        if error_description:
            qs += "&error_description=" + quote(error_description, safe="")
        return RedirectResponse(url=f"{base}/dashboard/integrations?{qs}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    try:
        payload = _b64decode_state(state)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid state")

    uid = payload.get("uid")
    if not uid:
        raise HTTPException(status_code=400, detail="Invalid state payload")

    redirect_uri = _redirect_uri_for_token_exchange(request, payload)
    token_url = f"https://{AUTH0_DOMAIN}/oauth/token"
    body = {
        "grant_type": "authorization_code",
        "client_id": AUTH0_CLIENT_ID,
        "client_secret": AUTH0_CLIENT_SECRET,
        "code": code,
        "redirect_uri": redirect_uri,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(token_url, json=body)
        tokens = resp.json()
    if resp.status_code >= 400:
        err = tokens.get("error_description") or tokens.get("error") or resp.text
        logger.warning("Auth0 token exchange failed: %s", err)
        return RedirectResponse(url=f"{base}/dashboard/integrations?error=token_exchange")

    refresh = (tokens.get("refresh_token") or "").strip()
    id_tok = tokens.get("id_token") or ""
    auth0_sub = ""
    if id_tok:
        parts = id_tok.split(".")
        if len(parts) == 3:
            try:
                pad = "=" * (-len(parts[1]) % 4)
                claims = json.loads(
                    base64.urlsafe_b64decode(parts[1] + pad).decode()
                )
                auth0_sub = claims.get("sub") or ""
            except Exception:
                pass

    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    user_ref = db.collection("users").document(uid)

    existing_rt = ""
    try:
        snap = user_ref.get()
        if snap.exists:
            existing_rt = ((snap.to_dict() or {}).get("auth0_refresh_token") or "").strip()
    except Exception as e:
        logger.debug("callback: could not read existing auth0_refresh_token: %s", e)

    rt_for_vault_probe = (refresh or existing_rt).strip()

    patch: dict = {
        "auth0_sub": auth0_sub or None,
        "auth0_linked_at": SERVER_TIMESTAMP,
    }
    if refresh:
        patch["auth0_refresh_token"] = refresh

    op = payload.get("op", "link")
    integ = (payload.get("integration") or payload.get("connection") or "").strip()
    vault_exchange_ok: bool | None = None
    if op == "vault" and integ:
        try:
            _n = int((os.getenv("AUTH0_VAULT_VERIFY_ATTEMPTS") or "4").strip() or "4")
        except ValueError:
            _n = 4
        vault_exchange_ok = await _verify_vault_federated_exchange(
            integ,
            rt_for_vault_probe,
            attempts=max(1, min(_n, 12)),
            delay_sec=0.5,
        )
        if vault_exchange_ok:
            patch[f"vault_connection_{integ}"] = True
        else:
            patch[f"vault_connection_{integ}"] = DELETE_FIELD

    user_ref.set(patch, merge=True)

    q = f"auth0_linked=1&op={op}"
    if integ:
        q += f"&integration={integ}"
    if op == "vault" and integ and vault_exchange_ok is not None:
        q += f"&vault_exchange_ok={'1' if vault_exchange_ok else '0'}"
    return RedirectResponse(url=f"{base}/dashboard/integrations?{q}")


@router.delete("/link")
async def auth0_unlink(uid: str = Depends(get_current_uid)):
    """Remove Auth0 link (refresh token) and Token Vault flags from the user document."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    db.collection("users").document(uid).set(
        {
            "auth0_sub": None,
            "auth0_refresh_token": None,
            "vault_connection_slack": DELETE_FIELD,
            "vault_connection_github": DELETE_FIELD,
            "vault_connection_google": DELETE_FIELD,
        },
        merge=True,
    )
    return {"ok": True}
