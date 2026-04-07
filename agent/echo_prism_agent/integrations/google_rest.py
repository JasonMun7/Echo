"""Shared Google REST passthrough: validate URLs and dispatch httpx requests."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any
from urllib.parse import urlparse

import httpx

# Hostnames must be real Google API endpoints (Calendar/Drive/etc. on www; product-specific subdomains).
_GOOGLEAPIS_HOST = re.compile(
    r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.googleapis\.com$",
    re.IGNORECASE,
)

_BANNED_EXTRA_HEADER_KEYS = frozenset(
    {
        "authorization",
        "cookie",
        "host",
        "connection",
        "proxy-authorization",
        "proxy-connection",
    }
)


def is_trusted_google_api_host(netloc: str) -> bool:
    """True if host looks like a Google API hostname (subdomain of googleapis.com)."""
    if not netloc or "@" in netloc:
        return False
    host = netloc.split(":")[0].strip().lower()
    if not host or ".." in host:
        return False
    return bool(_GOOGLEAPIS_HOST.fullmatch(host))


def sanitize_extra_headers(raw: Any) -> dict[str, str]:
    """Merge safe client headers; never forward auth or hop-by-hop headers."""
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in raw.items():
        key = str(k).strip()
        if key.lower() in _BANNED_EXTRA_HEADER_KEYS:
            continue
        out[key] = str(v)
    return out


def _bounded_timeout(args: dict[str, Any]) -> float:
    try:
        t = float(args.get("timeout_seconds", 60))
    except (TypeError, ValueError):
        return 60.0
    return max(5.0, min(t, 120.0))


async def execute_rest(
    client: httpx.AsyncClient,
    args: dict[str, Any],
    default_headers: dict[str, str],
    http_result: Callable[[httpx.Response], dict[str, Any]],
) -> dict[str, Any]:
    """
    Generic Google HTTPS call. ``url`` must be https and host must match ``*.googleapis.com``.

    Args:
        verb / http_method: GET, POST, PUT, PATCH, DELETE
        url: full URL (e.g. https://sheets.googleapis.com/v4/spreadsheets/...)
        params: optional query dict (GET/DELETE/...)
        json: optional JSON body (POST/PUT/PATCH/DELETE)
        headers: optional extra headers (Authorization is always from the vault token)
        timeout_seconds: 5–120, default 60
    """
    verb = (args.get("verb") or args.get("http_method") or "GET").strip().upper()
    url = (args.get("url") or "").strip()
    if not url:
        return {"ok": False, "error": "rest requires `url`", "result": {}}
    parsed = urlparse(url)
    if parsed.scheme != "https":
        return {"ok": False, "error": "rest `url` must use https", "result": {}}
    if not is_trusted_google_api_host(parsed.netloc):
        return {
            "ok": False,
            "error": "rest `url` host must be a *.googleapis.com API hostname",
            "result": {},
        }
    if verb not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
        return {"ok": False, "error": f"rest `verb` not allowed: {verb}", "result": {}}

    params = args.get("params")
    if params is not None and not isinstance(params, dict):
        return {"ok": False, "error": "rest `params` must be a JSON object", "result": {}}

    body = args.get("json")
    if body is not None and not isinstance(body, (dict, list)):
        return {"ok": False, "error": "rest `json` must be a JSON object or array", "result": {}}

    req_headers = {**default_headers, **sanitize_extra_headers(args.get("headers"))}
    timeout = _bounded_timeout(args)

    kw: dict[str, Any] = {
        "method": verb,
        "url": url,
        "headers": req_headers,
        "timeout": timeout,
    }
    if params:
        kw["params"] = params
    if verb in ("POST", "PUT", "PATCH") and body is not None:
        kw["json"] = body
    elif verb == "DELETE" and body is not None:
        kw["json"] = body
    r = await client.request(**kw)
    return http_result(r)
