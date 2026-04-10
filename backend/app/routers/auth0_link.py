"""
Auth0 link (Approach A): store Auth0 refresh token + sub on Firestore user doc for Token Vault exchange.

Callback URL must match Auth0 Application: https://<backend>/api/auth0/callback

Resolution order: ``AUTH0_CALLBACK_URL`` (full URL), else ``BACKEND_URL`` + ``/api/auth0/callback``
(injected by ``scripts/deploy/deploy-backend.sh``), else ``request.base_url`` (local dev).
Do not use ``FRONTEND_ORIGIN`` — OAuth callbacks hit the API host, not the Next.js host.
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
)

try:
    from echo_prism_agent.auth0_token_vault import OAUTH_TOKEN_REQUEST_HEADERS
except ImportError:
    OAUTH_TOKEN_REQUEST_HEADERS = {"Accept": "application/json"}

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


def _vault_use_my_account_connect() -> bool:
    """True unless ``AUTH0_VAULT_USE_MY_ACCOUNT_CONNECT`` is ``0``, ``false``, ``no``, or ``off``."""
    v = (os.getenv("AUTH0_VAULT_USE_MY_ACCOUNT_CONNECT") or "").strip().lower()
    if v in ("0", "false", "no", "off"):
        return False
    return True


def _callback_url(request: Request) -> str:
    explicit = (os.getenv("AUTH0_CALLBACK_URL") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    backend = (os.getenv("BACKEND_URL") or "").strip()
    if backend:
        return backend.rstrip("/") + "/api/auth0/callback"
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
    backend = (os.getenv("BACKEND_URL") or "").strip()
    if backend:
        return backend.rstrip("/") + "/api/auth0/callback"
    return str(request.url).split("?")[0]


def _vault_verify_hint_message(raw: str | None, max_len: int = 320) -> str:
    """Short, single-line hint for redirect query (no secrets)."""
    if not raw or not str(raw).strip():
        return (
            "Auth0 did not return a federated access token. "
            "Check Connected Accounts for Token Vault, Offline Access, and Grant Types on your application."
        )
    one = " ".join(str(raw).split())
    return one[:max_len] + ("…" if len(one) > max_len else "")


async def _verify_vault_federated_exchange(
    integration_echo_id: str,
    auth0_refresh_token: str,
    *,
    attempts: int = 1,
    delay_sec: float = 0.5,
) -> tuple[bool, str | None]:
    """
    Run the same federated Token Vault exchange as the agent.
    Used so we only set vault_connection_* when Auth0 actually returns a provider access token.

    The OAuth callback may return before Auth0 has fully committed Connected Account / vault
    state; use attempts>1 with a short delay to reduce false negatives.

    Returns (ok, detail_if_failed) — detail is safe to show in a UI hint (truncated).
    """
    rt = (auth0_refresh_token or "").strip()
    if not rt:
        return False, _vault_verify_hint_message("No Auth0 refresh token available for Token Vault exchange.")
    try:
        from echo_prism_agent.auth0_token_vault import (
            connection_name_for_integration,
            federated_token_exchange_response,
            token_vault_enabled,
        )
    except ImportError:
        logger.warning("echo_prism_agent unavailable; skipping Token Vault verification on callback")
        return False, _vault_verify_hint_message("Server could not load Token Vault integration module.")
    if not token_vault_enabled():
        return False, _vault_verify_hint_message("Token Vault exchange is disabled (set AUTH0_TOKEN_VAULT=1).")
    conn = connection_name_for_integration(integration_echo_id)
    if not conn:
        return False, _vault_verify_hint_message(f"Unknown integration: {integration_echo_id!r}")

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
            return True, None
        err_oauth = data.get("error")
        desc = data.get("error_description")
        if not status:
            last_err = str(desc or data.get("error") or "AUTH0_DOMAIN or config error")
        elif not tok:
            last_err = f"HTTP {status} oauth_error={err_oauth!r} oauth_error_description={str(desc)[:300]!r}"
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
    return False, _vault_verify_hint_message(last_err)


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
        "auth0_email": data.get("auth0_email"),
        "auth0_configured": _auth0_configured(),
    }


@router.get("/link-url")
async def auth0_link_url(
    request: Request,
    connection: str | None = Query(
        None,
        description=(
            "Optional: force Link Auth0 to a specific Auth0 connection name (e.g. google-oauth2). "
            "If omitted, Universal Login offers every connection enabled for Authentication on this app. "
            "Overrides AUTH0_LINK_CONNECTION env for this request."
        ),
    ),
    uid: str = Depends(get_current_uid),
):
    """Start Auth0 Universal Login to obtain a refresh token (link Echo user to Auth0).

    Optional ``connection`` query param or ``AUTH0_LINK_CONNECTION`` env forces that IdP for Link.
    If both are unset, Auth0 shows all connections whose **Purpose** includes Authentication
    (e.g. Google). Use ``/vault-url`` for the separate Token Vault **Connect** step per provider.
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
    Token Vault **Connect** (My Account ``…/connected-accounts/*`` by default).

    Set ``AUTH0_VAULT_USE_MY_ACCOUNT_CONNECT=0`` for legacy ``/authorize?connection=`` (connection
    must allow **Authentication**). Optional ``AUTH0_VAULT_CALLBACK_URL`` for a dedicated connect
    callback like the auth0-fastapi samples.

    ``?integration=slack|github|google`` maps to Auth0 connection names and ``vault_connection_*`` keys.
    """
    if not _auth0_configured():
        raise HTTPException(status_code=503, detail="Auth0 is not configured on the server")
    if not integration and not connection:
        raise HTTPException(
            status_code=400,
            detail="Provide integration (slack|github|google) or connection",
        )
    try:
        from echo_prism_agent.auth0_my_account_connect import (
            start_connected_account_connect,
            upstream_scopes_for_integration,
        )
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

    if _vault_use_my_account_connect():
        app = get_firebase_app()
        db = firebase_admin.firestore.client(app)
        snap = db.collection("users").document(uid).get()
        rt = ((snap.to_dict() or {}).get("auth0_refresh_token") or "").strip()
        if not rt:
            raise HTTPException(
                status_code=400,
                detail="Link Auth0 first (no Auth0 refresh token on user document).",
            )
        redirect_uri = _vault_oauth_redirect_uri(request)
        upstream = upstream_scopes_for_integration(echo_key)
        aparam: dict | None = None
        if echo_key == "google":
            # `access_type` is not valid in My Account `authorization_params` (schema rejection).
            aparam = {"prompt": "consent"}
        started = await start_connected_account_connect(
            domain=AUTH0_DOMAIN,
            client_id=AUTH0_CLIENT_ID,
            client_secret=AUTH0_CLIENT_SECRET,
            refresh_token=rt,
            connection=auth0_conn,
            redirect_uri=redirect_uri,
            upstream_scopes=upstream,
            authorization_params=aparam,
        )
        if not started:
            host = (AUTH0_DOMAIN or "").replace("https://", "").rstrip("/")
            raise HTTPException(
                status_code=503,
                detail=(
                    "My Account connect failed. Check server logs. "
                    f"Typical setup: My Account API + MRRT for https://{host}/me/ "
                    "(README Token Vault / AUTH0_VAULT_USE_MY_ACCOUNT_CONNECT)."
                ),
            )
        browser_url, ma_state, auth_session, code_verifier = started
        db.collection("auth0_connect_tx").document(ma_state).set(
            {
                "uid": uid,
                "integration": echo_key,
                "auth_session": auth_session,
                "code_verifier": code_verifier,
                "redirect_uri": redirect_uri,
                "created_at": SERVER_TIMESTAMP,
            }
        )
        return {"auth_url": browser_url}

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
    if AUTH0_AUDIENCE:
        params["audience"] = AUTH0_AUDIENCE
    url = f"https://{AUTH0_DOMAIN}/authorize?" + urlencode(params)
    return {"auth_url": url}


@router.get("/callback")
@router.get("/connect/callback")
async def auth0_callback(
    request: Request,
    code: str | None = Query(None),
    state: str | None = Query(None),
    connect_code: str | None = Query(None),
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

    # My Account API — Connected Accounts (connect_code + state from Auth0; no OAuth authorization code).
    if connect_code and state:
        try:
            from echo_prism_agent.auth0_my_account_connect import (
                complete_connected_account_connect,
            )
        except ImportError:
            raise HTTPException(status_code=503, detail="echo_prism_agent is not available")

        app = get_firebase_app()
        db = firebase_admin.firestore.client(app)
        tx_ref = db.collection("auth0_connect_tx").document(state)
        tx_snap = tx_ref.get()
        if not tx_snap.exists:
            return RedirectResponse(
                url=f"{base}/dashboard/integrations?error=invalid_request&error_description="
                + quote("Unknown or expired connect state; start Connect again.", safe="")
            )
        tx = tx_snap.to_dict() or {}
        tx_ref.delete()
        c_uid = (tx.get("uid") or "").strip()
        integ = (tx.get("integration") or "").strip()
        auth_session = (tx.get("auth_session") or "").strip()
        code_verifier = (tx.get("code_verifier") or "").strip()
        redirect_uri_tx = (tx.get("redirect_uri") or "").strip()
        if not c_uid or not integ or not auth_session or not redirect_uri_tx:
            raise HTTPException(status_code=400, detail="Invalid connect transaction payload")

        user_ref = db.collection("users").document(c_uid)
        usnap = user_ref.get()
        rt = ((usnap.to_dict() or {}).get("auth0_refresh_token") or "").strip()
        if not rt:
            return RedirectResponse(
                url=f"{base}/dashboard/integrations?error=token_exchange&error_description="
                + quote("No Auth0 refresh token; link Auth0 again.", safe="")
            )

        ok = await complete_connected_account_connect(
            domain=AUTH0_DOMAIN,
            client_id=AUTH0_CLIENT_ID,
            client_secret=AUTH0_CLIENT_SECRET,
            refresh_token=rt,
            auth_session=auth_session,
            connect_code=connect_code,
            redirect_uri=redirect_uri_tx,
            code_verifier=code_verifier,
        )
        if not ok:
            return RedirectResponse(
                url=f"{base}/dashboard/integrations?error=token_exchange&error_description="
                + quote("My Account connect complete failed.", safe="")
            )

        try:
            _n = int((os.getenv("AUTH0_VAULT_VERIFY_ATTEMPTS") or "4").strip() or "4")
        except ValueError:
            _n = 4
        vault_exchange_ok, vault_detail = await _verify_vault_federated_exchange(
            integ,
            rt,
            attempts=max(1, min(_n, 12)),
            delay_sec=0.5,
        )
        patch: dict = {}
        if vault_exchange_ok:
            patch[f"vault_connection_{integ}"] = True
        else:
            patch[f"vault_connection_{integ}"] = DELETE_FIELD
        user_ref.set(patch, merge=True)
        q = f"auth0_linked=1&op=vault&integration={integ}&vault_exchange_ok={'1' if vault_exchange_ok else '0'}"
        if not vault_exchange_ok and vault_detail:
            q += "&vault_exchange_detail=" + quote(vault_detail, safe="")
        return RedirectResponse(url=f"{base}/dashboard/integrations?{q}")

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
    # Auth0: POST /oauth/token must use application/x-www-form-urlencoded (not JSON).
    body = {
        "grant_type": "authorization_code",
        "client_id": AUTH0_CLIENT_ID,
        "client_secret": AUTH0_CLIENT_SECRET,
        "code": code,
        "redirect_uri": redirect_uri,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            token_url,
            data=body,
            headers=OAUTH_TOKEN_REQUEST_HEADERS,
        )
        tokens = resp.json()
    if resp.status_code >= 400:
        err = tokens.get("error_description") or tokens.get("error") or resp.text
        logger.warning("Auth0 token exchange failed: %s", err)
        return RedirectResponse(url=f"{base}/dashboard/integrations?error=token_exchange")

    refresh = (tokens.get("refresh_token") or "").strip()
    id_tok = tokens.get("id_token") or ""
    auth0_sub = ""
    auth0_email: str | None = None
    if id_tok:
        parts = id_tok.split(".")
        if len(parts) == 3:
            try:
                pad = "=" * (-len(parts[1]) % 4)
                claims = json.loads(base64.urlsafe_b64decode(parts[1] + pad).decode())
                auth0_sub = claims.get("sub") or ""
                em = (claims.get("email") or "").strip()
                auth0_email = em or None
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
    if auth0_email is not None:
        patch["auth0_email"] = auth0_email
    if refresh:
        patch["auth0_refresh_token"] = refresh

    op = payload.get("op", "link")
    integ = (payload.get("integration") or payload.get("connection") or "").strip()
    vault_exchange_ok: bool | None = None
    vault_exchange_detail: str | None = None
    if op == "vault" and integ:
        try:
            _n = int((os.getenv("AUTH0_VAULT_VERIFY_ATTEMPTS") or "4").strip() or "4")
        except ValueError:
            _n = 4
        vault_exchange_ok, vault_exchange_detail = await _verify_vault_federated_exchange(
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
        if not vault_exchange_ok and vault_exchange_detail:
            q += "&vault_exchange_detail=" + quote(vault_exchange_detail, safe="")
    return RedirectResponse(url=f"{base}/dashboard/integrations?{q}")


@router.delete("/link")
async def auth0_unlink(uid: str = Depends(get_current_uid)):
    """Remove Auth0 link (refresh token) and Token Vault flags from the user document."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    db.collection("users").document(uid).set(
        {
            "auth0_sub": None,
            "auth0_email": None,
            "auth0_refresh_token": None,
            "vault_connection_slack": DELETE_FIELD,
            "vault_connection_github": DELETE_FIELD,
            "vault_connection_google": DELETE_FIELD,
        },
        merge=True,
    )
    return {"ok": True}
