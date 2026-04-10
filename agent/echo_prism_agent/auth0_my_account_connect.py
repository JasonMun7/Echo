"""
Auth0 My Account API — Connected Accounts for Token Vault.

Flow: ``POST …/connected-accounts/connect`` → browser → IdP consent → callback with
``connect_code`` → ``POST …/connected-accounts/complete`` (skip ``complete`` and the vault stays empty).

Legacy Connect uses ``/authorize?connection=`` and requires **Authentication** on that connection.
Default Echo Connect uses this module’s My Account path instead (see auth0-server-python
``examples/ConnectedAccounts.md``).

Docs: https://auth0.com/docs/secure/tokens/token-vault/connected-accounts-for-token-vault
My Account API: https://auth0.com/docs/manage-users/my-account-api
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
from typing import Any
from urllib.parse import urlencode, urlparse, urlunparse

import httpx
from echo_prism_agent.auth0_token_vault import OAUTH_TOKEN_REQUEST_HEADERS

logger = logging.getLogger(__name__)

# Scopes for exchanging the user's Auth0 refresh token for a My Account API access token (MRRT).
# Match Auth0 docs: create + read + delete Connected Accounts on the `https://<domain>/me/` audience.
MY_ACCOUNT_REFRESH_SCOPES = (
    "openid profile offline_access create:me:connected_accounts read:me:connected_accounts delete:me:connected_accounts"
)


def my_account_audience(domain: str) -> str:
    d = (domain or "").strip().replace("https://", "").rstrip("/")
    return f"https://{d}/me/"


def _pkce_pair() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


def _append_ticket_to_connect_uri(connect_uri: str, ticket: str) -> str:
    parsed = urlparse(connect_uri)
    q = urlencode({"ticket": ticket})
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, q, parsed.fragment))


async def exchange_refresh_for_my_account_access_token(
    *,
    domain: str,
    client_id: str,
    client_secret: str,
    refresh_token: str,
) -> str | None:
    """
    Obtain an access token for the My Account API audience using the user's Auth0 refresh token.

    Requires MRRT / refresh-token policies so the refresh token can be used with audience
    ``https://<domain>/me/`` (see Auth0 Dashboard → Applications → refresh token policies).
    """
    d = (domain or "").strip().replace("https://", "").rstrip("/")
    url = f"https://{d}/oauth/token"
    audience = my_account_audience(d)
    body: dict[str, str] = {
        "grant_type": "refresh_token",
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "audience": audience,
        "scope": MY_ACCOUNT_REFRESH_SCOPES,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, data=body, headers=OAUTH_TOKEN_REQUEST_HEADERS)
        data = resp.json()
    if resp.status_code >= 400:
        logger.warning(
            "My Account token exchange failed: %s",
            data.get("error_description") or data.get("error") or resp.text,
        )
        return None
    at = (data.get("access_token") or "").strip()
    return at or None


async def start_connected_account_connect(
    *,
    domain: str,
    client_id: str,
    client_secret: str,
    refresh_token: str,
    connection: str,
    redirect_uri: str,
    upstream_scopes: list[str] | None,
    authorization_params: dict[str, Any] | None,
) -> tuple[str, str, str, str] | None:
    """
    Call My Account ``connected-accounts/connect``.

    Returns (browser_redirect_url, ma_state, auth_session, code_verifier) or None on failure.
    """
    access = await exchange_refresh_for_my_account_access_token(
        domain=domain,
        client_id=client_id,
        client_secret=client_secret,
        refresh_token=refresh_token,
    )
    if not access:
        return None

    ma_state = secrets.token_urlsafe(24)
    code_verifier, code_challenge = _pkce_pair()

    d = (domain or "").strip().replace("https://", "").rstrip("/")
    audience = my_account_audience(d)
    payload: dict[str, Any] = {
        "connection": connection,
        "redirect_uri": redirect_uri,
        "state": ma_state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    if upstream_scopes:
        payload["scopes"] = upstream_scopes
    if authorization_params:
        payload["authorization_params"] = authorization_params

    url = f"{audience}v1/connected-accounts/connect"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {access}"},
        )
        data = resp.json()
    if resp.status_code not in (200, 201):
        msg = data.get("detail") or data.get("title") or resp.text
        ve = data.get("validation_errors")
        if ve is not None:
            msg = f"{msg} (validation_errors={ve!r})"
        logger.warning("My Account connect start failed: %s", msg)
        return None

    connect_uri = (data.get("connect_uri") or "").strip()
    ticket = (data.get("connect_params") or {}).get("ticket") or ""
    auth_session = (data.get("auth_session") or "").strip()
    if not connect_uri or not ticket or not auth_session:
        logger.warning("My Account connect start: missing connect_uri, ticket, or auth_session")
        return None

    browser_url = _append_ticket_to_connect_uri(connect_uri, ticket)
    return browser_url, ma_state, auth_session, code_verifier


async def complete_connected_account_connect(
    *,
    domain: str,
    client_id: str,
    client_secret: str,
    refresh_token: str,
    auth_session: str,
    connect_code: str,
    redirect_uri: str,
    code_verifier: str,
) -> bool:
    access = await exchange_refresh_for_my_account_access_token(
        domain=domain,
        client_id=client_id,
        client_secret=client_secret,
        refresh_token=refresh_token,
    )
    if not access:
        return False

    d = (domain or "").strip().replace("https://", "").rstrip("/")
    audience = my_account_audience(d)
    body = {
        "auth_session": auth_session,
        "connect_code": connect_code,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
    }
    url = f"{audience}v1/connected-accounts/complete"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            json=body,
            headers={"Authorization": f"Bearer {access}"},
        )
        data = resp.json() if resp.content else {}
    # Auth0 docs: success is typically 200 OK; some responses use 201 Created.
    if resp.status_code not in (200, 201):
        logger.warning(
            "My Account connect complete failed: %s",
            data.get("detail") or data.get("title") or resp.text,
        )
        return False
    return True


def default_google_upstream_scopes() -> list[str] | None:
    """Upstream Google OAuth scopes for Connected Accounts ``connect``.

    **Default (env unset):** returns ``None`` — the My Account ``connect`` request omits
    ``scopes``, so Auth0 requests whatever is configured on the **Social → Google**
    connection in the Dashboard (same behavior as auth0-server-python when ``scopes`` is
    omitted).

    **Override:** set ``AUTH0_MY_ACCOUNT_GOOGLE_SCOPES`` to a comma-separated list of
    full scope URLs from ``integrations/google_scopes.py``. ``openid`` / userinfo URLs
    are merged in if missing. Drop ``offline_access`` unless it is on your GCP consent
    screen.
    """
    raw = (os.getenv("AUTH0_MY_ACCOUNT_GOOGLE_SCOPES") or "").strip()
    if not raw:
        return None
    user = [s.strip() for s in raw.split(",") if s.strip()]
    req = (
        "openid",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
    )
    out: list[str] = []
    for s in req:
        if s in user:
            out.append(s)
    for s in req:
        if s not in out:
            out.append(s)
    for s in user:
        if s not in out:
            out.append(s)
    return [s for s in out if s != "offline_access"]


def upstream_scopes_for_integration(echo_id: str) -> list[str] | None:
    e = (echo_id or "").strip().lower()
    if e == "google":
        return default_google_upstream_scopes()
    # Slack/GitHub: omit scopes → Auth0 uses connection defaults (see ConnectAccountRequest)
    if e in ("slack", "github"):
        return None
    return default_google_upstream_scopes()
