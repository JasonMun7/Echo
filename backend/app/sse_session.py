"""Short-lived signed cookie for SSE (EventSource cannot send Authorization)."""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import time

logger = logging.getLogger(__name__)

SSE_COOKIE_NAME = "echo_sse"
SSE_MAX_AGE_SEC = 300

_secret_warned = False


def _signing_secret() -> bytes:
    global _secret_warned
    raw = (os.getenv("ECHO_SSE_SESSION_SECRET") or "").strip()
    if not raw:
        if not _secret_warned:
            logger.warning(
                "ECHO_SSE_SESSION_SECRET unset; using dev-only default. Set a strong secret in production."
            )
            _secret_warned = True
        raw = "dev-only-echo-sse-secret-change-in-production"
    return raw.encode("utf-8")


def issue_sse_cookie_value(uid: str) -> str:
    exp = int(time.time()) + SSE_MAX_AGE_SEC
    payload = json.dumps({"uid": uid, "exp": exp}, sort_keys=True, separators=(",", ":"))
    b64 = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    sig = hmac.new(_signing_secret(), b64.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{b64}.{sig_b64}"


def verify_sse_cookie_value(value: str | None) -> str | None:
    if not value or "." not in value:
        return None
    try:
        b64, sig_b64 = value.split(".", 1)
        pad = "=" * (-len(sig_b64) % 4)
        sig = base64.urlsafe_b64decode(sig_b64 + pad)
        expected = hmac.new(_signing_secret(), b64.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, sig):
            return None
        payload_pad = "=" * (-len(b64) % 4)
        data = json.loads(base64.urlsafe_b64decode(b64 + payload_pad))
        if not isinstance(data, dict):
            return None
        if int(data.get("exp", 0)) < time.time():
            return None
        uid = data.get("uid")
        return uid if isinstance(uid, str) and uid else None
    except (ValueError, TypeError, json.JSONDecodeError, binascii.Error):
        return None
