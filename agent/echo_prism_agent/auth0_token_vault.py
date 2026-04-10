"""
Auth0 Token Vault: federated connection access token via refresh token exchange.

See: https://auth0.com/docs/secure/tokens/token-vault/refresh-token-exchange-with-token-vault
Auth0 AI (product) overview: https://auth0.com/ai/docs/intro/token-vault
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

GRANT_FEDERATED = "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token"
REQUESTED_TOKEN_TYPE = "http://auth0.com/oauth/token-type/federated-connection-access-token"
SUBJECT_REFRESH = "urn:ietf:params:oauth:token-type:refresh_token"

# Auth0 documents: POST /oauth/token with Content-Type: application/x-www-form-urlencoded
# and Accept: application/json (response body is JSON).
OAUTH_TOKEN_REQUEST_HEADERS: dict[str, str] = {"Accept": "application/json"}


def _domain() -> str:
    return (os.getenv("AUTH0_DOMAIN") or "").strip().replace("https://", "").rstrip("/")


def _client_id() -> str:
    return (os.getenv("AUTH0_CLIENT_ID") or "").strip()


def _client_secret() -> str:
    return (os.getenv("AUTH0_CLIENT_SECRET") or "").strip()


def token_vault_enabled() -> bool:
    return bool(
        _domain()
        and _client_id()
        and _client_secret()
        and os.getenv("AUTH0_TOKEN_VAULT", "1") not in ("0", "false", "False")
    )


def normalize_integration_id(integration_id: str) -> str:
    """Canonical id for Firestore keys and connector modules: lowercase strip."""
    return (integration_id or "").strip().lower()


def connection_name_for_integration(integration_id: str) -> str | None:
    """Map Echo integration id to Auth0 connection name (Dashboard → Authentication)."""
    nid = normalize_integration_id(integration_id)
    if not nid:
        return None
    key = f"AUTH0_CONNECTION_{nid.upper()}"
    explicit = (os.getenv(key) or "").strip()
    if explicit:
        return explicit
    defaults = {
        "slack": "slack",
        "github": "github",
        "google": "google-oauth2",
    }
    return defaults.get(nid)


async def federated_token_exchange_response(
    auth0_refresh_token: str,
    connection: str,
) -> tuple[int, dict[str, Any]]:
    """
    POST federated Token Vault exchange; returns (http_status, body_json).
    Does not raise on 4xx — callers inspect status and body.
    """
    domain = _domain()
    if not domain:
        return 0, {"error": "config", "error_description": "AUTH0_DOMAIN is not set"}

    url = f"https://{domain}/oauth/token"
    # Auth0 requires application/x-www-form-urlencoded and string parameters (not JSON body).
    payload = {
        "client_id": _client_id(),
        "client_secret": _client_secret(),
        "grant_type": GRANT_FEDERATED,
        "subject_token": auth0_refresh_token,
        "subject_token_type": SUBJECT_REFRESH,
        "requested_token_type": REQUESTED_TOKEN_TYPE,
        "connection": connection,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, data=payload, headers=OAUTH_TOKEN_REQUEST_HEADERS)
    try:
        data = resp.json()
    except Exception:
        text = (resp.text or "")[:800]
        return resp.status_code, {"error": "invalid_response", "error_description": text}
    if not isinstance(data, dict):
        return resp.status_code, {"error": "invalid_response", "error_description": str(data)[:500]}
    if resp.status_code >= 400:
        err = data.get("error_description") or data.get("error") or resp.text
        logger.warning(
            "Auth0 federated token exchange failed (%s): %s",
            resp.status_code,
            err,
        )
    return resp.status_code, data


async def exchange_federated_access_token(
    auth0_refresh_token: str,
    connection: str,
) -> dict[str, Any]:
    """
    Exchange an Auth0 refresh token for a third-party access token from Token Vault.
    Returns JSON body from /oauth/token (includes access_token, expires_in, scope, ...).
    """
    status, data = await federated_token_exchange_response(auth0_refresh_token, connection)
    if status == 0:
        raise RuntimeError(data.get("error_description") or "AUTH0_DOMAIN is not set")
    if status >= 400:
        err = data.get("error_description") or data.get("error") or "federated exchange failed"
        raise RuntimeError(str(err))
    return data


async def exchange_authorization_code(
    code: str,
    redirect_uri: str,
) -> dict[str, Any]:
    """Exchange Auth0 authorization code for tokens (link / callback).

    Uses ``application/x-www-form-urlencoded`` as required by Auth0 for ``POST /oauth/token``.
    """
    domain = _domain()
    url = f"https://{domain}/oauth/token"
    payload = {
        "grant_type": "authorization_code",
        "client_id": _client_id(),
        "client_secret": _client_secret(),
        "code": code,
        "redirect_uri": redirect_uri,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, data=payload, headers=OAUTH_TOKEN_REQUEST_HEADERS)
        data = resp.json()
    if resp.status_code >= 400:
        err = data.get("error_description") or data.get("error") or resp.text
        raise RuntimeError(str(err))
    return data
