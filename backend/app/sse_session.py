"""Short-lived signed cookie for SSE (EventSource cannot send Authorization)."""

from __future__ import annotations

import logging
import os

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

logger = logging.getLogger(__name__)

SSE_COOKIE_NAME = "echo_sse"
SSE_MAX_AGE_SEC = 300
_SSE_SALT = "echo-sse-session"

# Mutable flag so we log once without a module-level ``global`` assignment.
_dev_default_secret_warned: dict[str, bool] = {"done": False}


def _is_production_env() -> bool:
    v = (os.getenv("ENV") or os.getenv("ECHO_ENV") or "").strip().lower()
    return v in ("production", "prod", "prd")


def _signing_secret() -> str:
    raw = (os.getenv("ECHO_SSE_SESSION_SECRET") or "").strip()
    if not raw:
        if _is_production_env():
            raise RuntimeError("ECHO_SSE_SESSION_SECRET must be set when ENV or ECHO_ENV indicates production")
        if not _dev_default_secret_warned["done"]:
            logger.warning("ECHO_SSE_SESSION_SECRET unset; using dev-only default. Set a strong secret in production.")
            _dev_default_secret_warned["done"] = True
        raw = "dev-only-echo-sse-secret-change-in-production"
    return raw


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(_signing_secret(), salt=_SSE_SALT)


def issue_sse_cookie_value(uid: str) -> str:
    return _serializer().dumps({"uid": uid})


def verify_sse_cookie_value(value: str | None) -> str | None:
    if not value:
        return None
    try:
        data = _serializer().loads(value, max_age=SSE_MAX_AGE_SEC)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(data, dict):
        return None
    u = data.get("uid")
    return u if isinstance(u, str) and u else None
