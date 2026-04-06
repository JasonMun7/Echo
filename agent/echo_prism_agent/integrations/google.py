"""Google APIs connector (Bearer token from Auth0 Token Vault → Google).

Each method needs the corresponding OAuth scopes on the Auth0 Google connection
and Google Cloud consent screen; otherwise Google returns 403.

Maximum scope groups Auth0/Google may offer for this integration: see
``google_scopes.GOOGLE_OAUTH_MAX_BY_PRODUCT``.
"""
from __future__ import annotations

from typing import Any

import httpx

def _bounded_int(args: dict[str, Any], key: str, default: int, cap: int) -> int:
    try:
        v = int(args.get(key, default))
        return max(1, min(v, cap))
    except (TypeError, ValueError):
        return default


METHODS: dict[str, str] = {
    "userinfo": "GET oauth2/v3/userinfo — basic profile (openid / profile / email)",
    "calendar_list": "GET calendar/v3/users/me/calendarList — needs calendar or calendar.readonly",
    "gmail_list_labels": "GET gmail/v1/users/me/labels — needs gmail.labels or gmail.readonly",
    "drive_list_files": "GET drive/v3/files — needs drive.readonly or drive.metadata.readonly",
}


def _http_result(r: httpx.Response) -> dict[str, Any]:
    if r.status_code >= 400:
        return {"ok": False, "error": r.text or f"http_{r.status_code}", "result": {}}
    try:
        data = r.json()
    except Exception:
        data = {"raw": r.text}
    return {"ok": True, "result": data}


async def execute(method: str, args: dict[str, Any], access_token: str) -> dict[str, Any]:
    if not access_token:
        return {"ok": False, "error": "missing_access_token", "result": {}}
    method = (method or "").strip().lower().replace("-", "_")
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        if method == "userinfo":
            r = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers=headers,
            )
            return _http_result(r)

        if method == "calendar_list":
            params: dict[str, Any] = {
                "maxResults": _bounded_int(args, "maxResults", 10, 250),
            }
            if args.get("pageToken"):
                params["pageToken"] = str(args["pageToken"])
            r = await client.get(
                "https://www.googleapis.com/calendar/v3/users/me/calendarList",
                headers=headers,
                params=params,
            )
            return _http_result(r)

        if method == "gmail_list_labels":
            r = await client.get(
                "https://gmail.googleapis.com/gmail/v1/users/me/labels",
                headers=headers,
            )
            return _http_result(r)

        if method == "drive_list_files":
            params = {
                "pageSize": _bounded_int(args, "pageSize", 10, 100),
                "fields": args.get(
                    "fields",
                    "nextPageToken, files(id, name, mimeType, modifiedTime)",
                ),
            }
            if args.get("q"):
                params["q"] = str(args["q"])
            if args.get("pageToken"):
                params["pageToken"] = str(args["pageToken"])
            r = await client.get(
                "https://www.googleapis.com/drive/v3/files",
                headers=headers,
                params=params,
            )
            return _http_result(r)

    return {"ok": False, "error": f"unknown_method:{method}", "result": {}}
