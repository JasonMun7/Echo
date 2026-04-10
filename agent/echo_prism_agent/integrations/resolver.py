"""
Resolve a short-lived provider access token for an integration (Auth0 Token Vault by default).

Legacy Firestore tokens (users/{uid}/integrations/{id}) are disabled unless
ECHO_INTEGRATIONS_TOKEN_VAULT_ONLY=0.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from echo_prism_agent.auth0_token_vault import (
    connection_name_for_integration,
    exchange_federated_access_token,
    normalize_integration_id,
    token_vault_enabled,
)

logger = logging.getLogger(__name__)


def _token_vault_only_mode() -> bool:
    """Default True: do not fall back to legacy OAuth tokens stored in Firestore."""
    v = (os.getenv("ECHO_INTEGRATIONS_TOKEN_VAULT_ONLY") or "1").strip().lower()
    return v not in ("0", "false", "no")


async def get_integration_access_token(
    uid: str,
    integration: str,
    db: Any,
) -> str:
    """
    Prefer Auth0 Token Vault (federated exchange) when enabled and user has linked Auth0.
    If ECHO_INTEGRATIONS_TOKEN_VAULT_ONLY is unset or true, legacy Firestore tokens are not used
    **only when Token Vault is actually configured** on this process; otherwise legacy may be used.
    """
    iid = normalize_integration_id(integration)
    if not iid:
        return ""

    vault_ok = token_vault_enabled()

    if vault_ok:
        try:
            user_doc = await _get_doc(db.collection("users").document(uid))
            data = user_doc.to_dict() or {}
            refresh = (data.get("auth0_refresh_token") or "").strip()
            if refresh:
                conn = connection_name_for_integration(iid)
                if conn:
                    try:
                        out = await exchange_federated_access_token(refresh, conn)
                        token = (out.get("access_token") or out.get("token") or "").strip()
                        if token:
                            return token
                        logger.warning(
                            "Token Vault exchange returned no access_token for integration=%s (keys=%s)",
                            iid,
                            list(out.keys()) if isinstance(out, dict) else type(out),
                        )
                    except Exception as e:
                        logger.warning("Token Vault exchange failed for %s: %s", iid, e)
                else:
                    logger.warning(
                        "No Auth0 connection mapping for integration=%r (normalized=%s)",
                        integration,
                        iid,
                    )
            else:
                logger.debug("No auth0_refresh_token on user doc; cannot use Token Vault for %s", iid)
        except Exception as e:
            logger.warning("Token Vault path failed: %s", e)
    else:
        logger.debug(
            "Token Vault not configured on this process (set AUTH0_DOMAIN, AUTH0_CLIENT_ID, "
            "AUTH0_CLIENT_SECRET); skipping federated exchange for integration=%s",
            iid,
        )

    # Block legacy only when vault is configured and we intentionally disallow legacy tokens.
    if _token_vault_only_mode() and vault_ok:
        return ""

    try:
        token_doc = await _get_doc(db.collection("users").document(uid).collection("integrations").document(iid))
        if token_doc.exists:
            return (token_doc.to_dict() or {}).get("access_token", "") or ""
    except Exception as e:
        logger.warning("Legacy integration token read failed: %s", e)
    return ""


async def _get_doc(ref: Any) -> Any:
    import asyncio

    return await asyncio.to_thread(lambda: ref.get())


async def integration_connect_hint(uid: str, integration: str, db: Any) -> dict[str, Any]:
    """
    When no provider access token is available, tell the client how to open Auth0:
    - **link_auth0**: user has no Auth0 refresh token → GET /api/auth0/link-url
    - **connect_integration**: Auth0 linked → GET /api/auth0/vault-url?integration=…
    """
    user_doc = await _get_doc(db.collection("users").document(uid))
    data = user_doc.to_dict() or {}
    refresh = (data.get("auth0_refresh_token") or "").strip()
    auth0_linked = bool(refresh)
    return {
        "auth0_linked": auth0_linked,
        "connect_kind": "connect_integration" if auth0_linked else "link_auth0",
        "integration": normalize_integration_id(integration),
    }
